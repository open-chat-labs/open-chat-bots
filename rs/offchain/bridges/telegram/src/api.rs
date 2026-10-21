use anyhow::{Result, anyhow};
use oc_bridge_core::PermanentFailure;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// The few Bot API methods the bridge uses
pub struct TelegramApi {
    http: reqwest::Client,
    token: String,
}

impl TelegramApi {
    pub fn new(token: String) -> Self {
        TelegramApi {
            http: reqwest::Client::new(),
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

    pub async fn get_me(&self) -> Result<User> {
        self.call("getMe", &json!({})).await
    }

    /// Telegram sends updates to `url` with `secret` in a header, one at a time so a chat's
    /// messages arrive in order
    pub async fn set_webhook(&self, url: &str, secret: &str) -> Result<()> {
        let body = json!({
            "url": url,
            "secret_token": secret,
            "max_connections": 1,
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
}
