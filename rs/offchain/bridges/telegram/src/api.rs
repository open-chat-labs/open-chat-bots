use anyhow::{Result, anyhow};
use oc_bridge_core::PermanentFailure;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::Duration;

/// The few Bot API methods the bridge uses
pub struct TelegramApi {
    http: reqwest::Client,
    token: String,
}

impl TelegramApi {
    pub fn new(token: String) -> Self {
        TelegramApi {
            // Well inside the 60 seconds OpenChat waits before sending a notification again
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(20))
                .build()
                .expect("Failed to build an HTTP client"),
            token,
        }
    }

    pub async fn send_message(
        &self,
        chat_id: i64,
        html: &str,
        reply_to: Option<i64>,
    ) -> Result<SentMessage> {
        let mut body = json!({
            "chat_id": chat_id,
            "text": html,
            "parse_mode": "HTML",
            "link_preview_options": { "is_disabled": true },
        });
        if let Some(reply_to) = reply_to {
            body["reply_parameters"] = json!({
                "message_id": reply_to,
                "allow_sending_without_reply": true,
            });
        }
        self.call("sendMessage", &body).await
    }

    pub async fn edit_message_text(&self, chat_id: i64, message_id: i64, html: &str) -> Result<()> {
        let body = json!({
            "chat_id": chat_id,
            "message_id": message_id,
            "text": html,
            "parse_mode": "HTML",
            "link_preview_options": { "is_disabled": true },
        });
        self.call::<Value>("editMessageText", &body)
            .await
            .map(|_| ())
    }

    pub async fn delete_message(&self, chat_id: i64, message_id: i64) -> Result<()> {
        let body = json!({ "chat_id": chat_id, "message_id": message_id });
        self.call::<bool>("deleteMessage", &body).await.map(|_| ())
    }

    /// Whether the user is the chat's creator or one of its administrators
    pub async fn is_admin(&self, chat_id: i64, user_id: i64) -> Result<bool> {
        let body = json!({ "chat_id": chat_id, "user_id": user_id });
        let member: ChatMember = self.call("getChatMember", &body).await?;
        Ok(matches!(
            member.status.as_str(),
            "creator" | "administrator"
        ))
    }

    /// The user's current profile photo, in the smallest size at least `min_width` wide, or the
    /// largest. None if they have none the bot can see, which their privacy settings decide.
    pub async fn current_profile_photo(
        &self,
        user_id: i64,
        min_width: u32,
    ) -> Result<Option<PhotoSize>> {
        let body = json!({ "user_id": user_id, "limit": 1 });
        let photos: UserProfilePhotos = self.call("getUserProfilePhotos", &body).await?;
        Ok(photos
            .photos
            .into_iter()
            .next()
            .and_then(|sizes| pick_size(sizes, min_width)))
    }

    /// Downloads a file the bot can see, eg. a profile photo
    pub async fn download_file(&self, file_id: &str) -> Result<Vec<u8>> {
        let file: File = self.call("getFile", &json!({ "file_id": file_id })).await?;
        let path = file
            .file_path
            .ok_or_else(|| anyhow!("Telegram gave no path for the file"))?;
        // The token is in the url, so it's left out of any error
        let response = self
            .http
            .get(format!(
                "https://api.telegram.org/file/bot{}/{path}",
                self.token
            ))
            .send()
            .await
            .and_then(|response| response.error_for_status())
            .map_err(|error| anyhow!("Downloading a file failed: {}", error.without_url()))?;
        let bytes = response
            .bytes()
            .await
            .map_err(|error| anyhow!("Downloading a file failed: {}", error.without_url()))?;
        Ok(bytes.to_vec())
    }

    pub async fn get_me(&self) -> Result<User> {
        self.call("getMe", &json!({})).await
    }

    /// Telegram sends updates to `url` with `secret` in a header. It sends up to 10 at once, as
    /// one at a time would let every group's messages wait on each relay, at the cost of
    /// messages sent within a moment of each other sometimes arriving out of order.
    pub async fn set_webhook(&self, url: &str, secret: &str) -> Result<()> {
        let body = json!({
            "url": url,
            "secret_token": secret,
            "max_connections": 10,
            "allowed_updates": ["message", "edited_message"],
        });
        self.call::<bool>("setWebhook", &body).await.map(|_| ())
    }

    pub async fn set_my_commands(&self, commands: &[(&str, &str)], scope: &str) -> Result<()> {
        let commands: Vec<Value> = commands
            .iter()
            .map(|(command, description)| json!({ "command": command, "description": description }))
            .collect();
        let body = json!({ "commands": commands, "scope": { "type": scope } });
        self.call::<bool>("setMyCommands", &body).await.map(|_| ())
    }

    // The token is in the url, so it's left out of any error
    async fn call<T: DeserializeOwned>(&self, method: &str, body: &impl Serialize) -> Result<T> {
        let response = self
            .http
            .post(format!(
                "https://api.telegram.org/bot{}/{method}",
                self.token
            ))
            .json(body)
            .send()
            .await
            .map_err(|error| anyhow!("Telegram's {method} failed: {}", error.without_url()))?;

        let status = response.status().as_u16();
        let result: ApiResponse<T> = response.json().await.map_err(|error| {
            anyhow!(
                "Telegram's {method} returned {status}: {}",
                error.without_url()
            )
        })?;

        match result {
            ApiResponse {
                ok: true,
                result: Some(result),
                ..
            } => Ok(result),
            ApiResponse {
                error_code,
                description,
                ..
            } => Err(api_error(method, error_code.unwrap_or(status), description)),
        }
    }
}

/// The smallest size at least `min_width` wide, or the largest
fn pick_size(mut sizes: Vec<PhotoSize>, min_width: u32) -> Option<PhotoSize> {
    sizes.sort_by_key(|size| size.width);
    let index = sizes
        .iter()
        .position(|size| size.width >= min_width)
        .unwrap_or(sizes.len().checked_sub(1)?);
    sizes.into_iter().nth(index)
}

// A refusal retrying won't fix is a `PermanentFailure`, and one saying the bot can't reach the chat
// any more, eg. as it was removed from it, means the chat is gone
fn api_error(method: &str, code: u16, description: Option<String>) -> anyhow::Error {
    let description = description.unwrap_or_default();
    let message = format!("Telegram's {method} returned {code}: {description}");
    let lower = description.to_lowercase();
    match code {
        403 => PermanentFailure::ChatGone.into(),
        400 if lower.contains("chat not found") || lower.contains("bot was kicked") => {
            PermanentFailure::ChatGone.into()
        }
        // Rate limited, so worth retrying
        429 => anyhow!(message),
        400..=499 => PermanentFailure::Rejected(message).into(),
        _ => anyhow!(message),
    }
}

#[derive(Deserialize)]
struct ApiResponse<T> {
    ok: bool,
    result: Option<T>,
    error_code: Option<u16>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct ChatMember {
    status: String,
}

#[derive(Deserialize, Debug)]
struct UserProfilePhotos {
    /// Each photo, newest first, in several sizes
    photos: Vec<Vec<PhotoSize>>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct PhotoSize {
    pub file_id: String,
    /// The same for the file whichever bot sees it, and from one day to the next, unlike `file_id`
    pub file_unique_id: String,
    pub width: u32,
}

#[derive(Deserialize, Debug)]
struct File {
    file_path: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct SentMessage {
    pub message_id: i64,
}

/// The parts of Telegram's updates the bridge uses
#[derive(Deserialize, Debug)]
pub struct Update {
    pub message: Option<Message>,
    pub edited_message: Option<Message>,
}

#[derive(Deserialize, Debug)]
pub struct Message {
    pub message_id: i64,
    pub chat: Chat,
    pub from: Option<User>,
    /// Set if a chat sent the message, eg. a channel, or a group's anonymous admins
    pub sender_chat: Option<Chat>,
    pub text: Option<String>,
    pub caption: Option<String>,
    pub reply_to_message: Option<Box<Message>>,
    pub photo: Option<Value>,
    pub video: Option<Value>,
    pub voice: Option<Value>,
    pub audio: Option<Value>,
    pub document: Option<Document>,
    pub sticker: Option<Sticker>,
    pub animation: Option<Value>,
    pub poll: Option<Poll>,
    pub video_note: Option<Value>,
    pub location: Option<Value>,
    pub venue: Option<Venue>,
    pub contact: Option<Value>,
    pub dice: Option<Dice>,
    /// Set on the service message Telegram sends in a group when it's upgraded to a supergroup,
    /// which has a new id
    pub migrate_to_chat_id: Option<i64>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Chat {
    pub id: i64,
    #[serde(rename = "type")]
    pub kind: String,
    pub title: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct User {
    pub id: i64,
    pub first_name: String,
    pub last_name: Option<String>,
    pub username: Option<String>,
    /// Only for the bot itself, from `getMe`: false if privacy mode is on, in which case it only
    /// sees commands and replies to it
    pub can_read_all_group_messages: Option<bool>,
}

#[derive(Deserialize, Debug)]
pub struct Document {
    pub file_name: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct Sticker {
    pub emoji: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct Poll {
    pub question: String,
}

#[derive(Deserialize, Debug)]
pub struct Venue {
    pub title: String,
}

#[derive(Deserialize, Debug)]
pub struct Dice {
    pub emoji: String,
    pub value: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bot_removed_from_a_chat_means_the_chat_is_gone() {
        for (code, description) in [
            (403, "Forbidden: bot was kicked from the group chat"),
            (400, "Bad Request: chat not found"),
        ] {
            let error = api_error("sendMessage", code, Some(description.to_string()));
            assert!(matches!(
                error.downcast_ref::<PermanentFailure>(),
                Some(PermanentFailure::ChatGone)
            ));
        }

        let error = api_error(
            "sendMessage",
            400,
            Some("Bad Request: text is too long".to_string()),
        );
        assert!(matches!(
            error.downcast_ref::<PermanentFailure>(),
            Some(PermanentFailure::Rejected(_))
        ));
        assert!(
            api_error("sendMessage", 429, None)
                .downcast_ref::<PermanentFailure>()
                .is_none()
        );
        assert!(
            api_error("sendMessage", 502, None)
                .downcast_ref::<PermanentFailure>()
                .is_none()
        );
    }

    #[test]
    fn updates_decode_with_the_fields_the_bridge_uses() {
        let update: Update = serde_json::from_value(json!({
            "update_id": 1,
            "message": {
                "message_id": 5,
                "date": 0,
                "chat": { "id": -100123, "type": "supergroup", "title": "Example" },
                "from": { "id": 42, "is_bot": false, "first_name": "Nelly", "username": "nelly" },
                "text": "hello",
                "reply_to_message": {
                    "message_id": 4,
                    "date": 0,
                    "chat": { "id": -100123, "type": "supergroup" }
                }
            }
        }))
        .unwrap();

        let message = update.message.unwrap();
        assert_eq!(message.chat.id, -100123);
        assert_eq!(message.text.as_deref(), Some("hello"));
        assert_eq!(message.reply_to_message.unwrap().message_id, 4);
    }

    #[test]
    fn a_profile_photo_is_taken_in_the_smallest_size_wide_enough() {
        let photos: UserProfilePhotos = serde_json::from_value(serde_json::json!({
            "total_count": 2,
            "photos": [[
                { "file_id": "big", "file_unique_id": "u1", "width": 640, "height": 640 },
                { "file_id": "small", "file_unique_id": "u1", "width": 160, "height": 160 },
                { "file_id": "medium", "file_unique_id": "u1", "width": 320, "height": 320 }
            ]]
        }))
        .unwrap();
        let sizes = photos.photos.into_iter().next().unwrap();

        let pick = |min_width| pick_size(sizes.clone(), min_width).map(|size| size.file_id);
        assert_eq!(pick(320).as_deref(), Some("medium"));
        assert_eq!(pick(100).as_deref(), Some("small"));
        // None is wide enough, so the largest
        assert_eq!(pick(1000).as_deref(), Some("big"));
        assert_eq!(pick_size(Vec::new(), 320).map(|size| size.file_id), None);
    }
}
