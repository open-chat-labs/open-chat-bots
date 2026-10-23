use crate::api::{Message, TelegramApi, Update};
use crate::platform::{Telegram, escape};
use anyhow::Result;
use oc_bots_sdk::types::{BridgedUser, BridgedUserId, TelegramUser};
use oc_bridge_core::util::{oc_chat_url, without_mention_everyone};
use oc_bridge_core::{Bridge, InboundMessage, PendingPairing};
use std::sync::Arc;
use tracing::warn;

// The backend's limits on a Telegram profile
const MAX_USERNAME_LENGTH: usize = 32;
const MAX_DISPLAY_NAME_LENGTH: usize = 129;

/// Handles what Telegram sends the bridge's webhook
pub struct UpdateHandler {
    pub bridge: Arc<Bridge<Telegram>>,
    pub api: Arc<TelegramApi>,
    /// The bot's username, so commands addressed to other bots, eg. `/bridge@OtherBot`, are left
    pub username: String,
}

impl UpdateHandler {
    pub async fn handle(&self, update: Update) -> Result<()> {
        if let Some(message) = update.message {
            if let Some(new_chat_id) = message.migrate_to_chat_id {
                // Upgraded to a supergroup, which has a new id
                self.bridge
                    .move_pairing(&message.chat.id.to_string(), &new_chat_id.to_string())
                    .await?;
                return Ok(());
            }
            self.message(message).await
        } else if let Some(message) = update.edited_message {
            self.edit(message).await
        } else {
            Ok(())
        }
    }

    async fn message(&self, message: Message) -> Result<()> {
        let is_private = message.chat.kind == "private";
        if let Some((command, arg)) = self
            .command(&message)
            .filter(|(command, arg)| is_private || is_group_command(command, arg.as_deref()))
        {
            let reply = if is_private {
                self.private_command(&message, &command, arg).await
            } else {
                self.group_command(&message, &command).await
            };
            if let Some(reply) = reply {
                // In a group, replying to the command shows whose it is
                let reply_to = (!is_private).then_some(message.message_id);
                // A failed reply isn't worth Telegram retrying the command for
                if let Err(error) = self
                    .api
                    .send_message(message.chat.id, &reply, reply_to)
                    .await
                {
                    warn!(%error, command, "Failed to reply to a command");
                }
            }
            return Ok(());
        }
        if is_private {
            let help = "To link your Telegram account to OpenChat, open your profile in \
                OpenChat, then choose Link Telegram under Linked accounts.";
            self.api.send_message(message.chat.id, help, None).await?;
            return Ok(());
        }

        self.bridge
            .relay_inbound(InboundMessage {
                platform_chat: message.chat.id.to_string(),
                platform_message: message.message_id.to_string(),
                author: author(&message),
                text: inbound_text(&message),
                reply_to: message
                    .reply_to_message
                    .as_ref()
                    .map(|reply| reply.message_id.to_string()),
            })
            .await
    }

    async fn edit(&self, message: Message) -> Result<()> {
        if message.chat.kind == "private" {
            return Ok(());
        }
        self.bridge
            .relay_inbound_edit(
                &message.chat.id.to_string(),
                &message.message_id.to_string(),
                inbound_text(&message),
            )
            .await
    }

    fn command(&self, message: &Message) -> Option<(String, Option<String>)> {
        parse_command(message.text.as_deref()?, &self.username)
    }

    async fn group_command(&self, message: &Message, command: &str) -> Option<String> {
        let chat = &message.chat;
        // Anyone in the group can see whether it's bridged
        if command == "status" {
            return Some(self.status(message, Some(&chat.id.to_string())).await);
        }
        // Run as themself, as the bridge can't message an anonymous admin privately
        let Some(from) = message
            .from
            .as_ref()
            .filter(|_| message.sender_chat.is_none())
        else {
            return Some(format!(
                "Run /{command} as yourself rather than anonymously."
            ));
        };
        match self.api.is_admin(chat.id, from.id).await {
            Ok(true) => {}
            Ok(false) => return Some(format!("Only the group's admins can run /{command}.")),
            Err(error) => {
                warn!(%error, "Failed to check whether a user is an admin");
                return Some("Something went wrong. Please try again.".to_string());
            }
        }

        if command == "unbridge" {
            return match self.bridge.unpair_platform_chat(&chat.id.to_string()).await {
                // Unpairing says so in the group itself
                Ok(true) => None,
                Ok(false) => Some("This group isn't bridged with OpenChat.".to_string()),
                Err(error) => {
                    warn!(%error, "Failed to unbridge");
                    Some("Something went wrong. Please try again.".to_string())
                }
            };
        }

        let pending = PendingPairing {
            platform_chat: chat.id.to_string(),
            name: chat
                .title
                .clone()
                .unwrap_or_else(|| "this group".to_string()),
            platform_data: None,
        };
        let code = match self.bridge.start_pairing(&pending).await {
            Ok(code) => code,
            Err(error) => {
                warn!(%error, "Failed to start pairing");
                return Some("Something went wrong. Please try again.".to_string());
            }
        };
        // Sent privately, as anyone in the group who saw the code could pair the group with an
        // OpenChat chat of their own
        let instructions = format!(
            "To bridge {} with OpenChat, install the bridge bot in the OpenChat group or public \
            channel to bridge with, then run <code>/bridge {code}</code> there within 15 minutes.",
            escape(&pending.name)
        );
        match self.api.send_message(from.id, &instructions, None).await {
            Ok(_) => Some("I've sent you the code privately.".to_string()),
            Err(_) => Some(format!(
                "Start a private chat with me first (t.me/{}), then run /bridge here again.",
                self.username
            )),
        }
    }

    async fn private_command(
        &self,
        message: &Message,
        command: &str,
        arg: Option<String>,
    ) -> Option<String> {
        let from = message.from.as_ref()?;
        Some(match (command, arg) {
            // The link the user followed from their OpenChat profile, eg. t.me/bot?start=<code>
            ("start", Some(code)) => match self.bridge.link(author(message), code).await {
                // In <code>, so Telegram doesn't take the username as a Telegram user's
                Ok(linked) => format!(
                    "Your Telegram account is now linked to <code>@{}</code> on OpenChat.",
                    escape(&linked.username)
                ),
                Err(error) => {
                    warn!(%error, "Failed to link a Telegram account");
                    "Your Telegram account couldn't be linked. Go back to OpenChat and try again."
                        .to_string()
                }
            },
            ("status", _) => self.status(message, None).await,
            ("unlink", _) => match self.bridge.unlink(BridgedUserId::Telegram(from.id)).await {
                Ok(true) => {
                    "Your Telegram account is no longer linked to an OpenChat account.".to_string()
                }
                Ok(false) => "Your Telegram account isn't linked to OpenChat.".to_string(),
                Err(error) => {
                    warn!(%error, "Failed to unlink a Telegram account");
                    "Something went wrong. Please try again.".to_string()
                }
            },
            ("bridge" | "unbridge", _) => "Run this in the group to bridge.".to_string(),
            _ => "To link your Telegram account to OpenChat, open your profile in OpenChat, then \
                choose Link Telegram under Linked accounts. Add me to a group and run /bridge \
                there to bridge it with OpenChat."
                .to_string(),
        })
    }

    /// Whether the group is bridged, when run in one, and whether the user's account is linked
    async fn status(&self, message: &Message, group: Option<&str>) -> String {
        let mut lines = Vec::new();
        if let Some(group) = group {
            lines.push(match self.bridge.store.pairing(group).await {
                Ok(Some(pairing)) => format!(
                    "This group is bridged with {}.",
                    oc_chat_url(&pairing.oc_chat)
                ),
                Ok(None) => "This group isn't bridged with OpenChat.".to_string(),
                Err(error) => {
                    warn!(%error, "Failed to look up a group's pairing");
                    return "Something went wrong. Please try again.".to_string();
                }
            });
        }
        // A group's anonymous admins, or a channel, have no account to link
        if let Some(from) = message
            .from
            .as_ref()
            .filter(|_| message.sender_chat.is_none())
        {
            lines.push(
                match self
                    .bridge
                    .linked_user(BridgedUserId::Telegram(from.id))
                    .await
                {
                    Ok(Some(linked)) => format!(
                        "Your Telegram account is linked to <code>@{}</code> on OpenChat.",
                        escape(&linked.username)
                    ),
                    Ok(None) => "Your Telegram account isn't linked to OpenChat. To link it, open \
                        your profile in OpenChat, then choose Link Telegram under Linked accounts."
                        .to_string(),
                    Err(error) => {
                        warn!(%error, "Failed to look up a linked account");
                        return "Something went wrong. Please try again.".to_string();
                    }
                },
            );
        }
        lines.join("\n")
    }
}

/// The command and its argument, if the text is one of this bot's commands. `/bridge@OtherBot` is
/// another bot's.
/// Whether the bridge answers a command in a group. The rest, eg. another bot's /start, are relayed
/// like any message. /status is a common name, so it's only taken on its own, not, say, in
/// "/status is green".
fn is_group_command(command: &str, arg: Option<&str>) -> bool {
    matches!(command, "bridge" | "unbridge") || (command == "status" && arg.is_none())
}

fn parse_command(text: &str, username: &str) -> Option<(String, Option<String>)> {
    let mut parts = text.trim().splitn(2, char::is_whitespace);
    let command = parts.next()?.strip_prefix('/')?;
    let (command, addressee) = match command.split_once('@') {
        Some((command, addressee)) => (command, Some(addressee)),
        None => (command, None),
    };
    if addressee.is_some_and(|a| !a.eq_ignore_ascii_case(username)) {
        return None;
    }
    let arg = parts.next().map(str::trim).filter(|a| !a.is_empty());
    matches!(
        command,
        "bridge" | "unbridge" | "status" | "start" | "unlink"
    )
    .then(|| (command.to_string(), arg.map(str::to_string)))
}

/// Who sent the message: a user, or a chat, eg. a group's anonymous admins
pub fn author(message: &Message) -> BridgedUser {
    let (id, username, display_name) = match (&message.sender_chat, &message.from) {
        (Some(chat), _) => (
            chat.id,
            None,
            chat.title
                .clone()
                .unwrap_or_else(|| "Telegram chat".to_string()),
        ),
        (None, Some(user)) => (
            user.id,
            user.username.clone(),
            match &user.last_name {
                Some(last_name) => format!("{} {last_name}", user.first_name),
                None => user.first_name.clone(),
            },
        ),
        (None, None) => (0, None, "Telegram user".to_string()),
    };
    BridgedUser::Telegram(TelegramUser {
        id,
        username: username.map(|u| u.chars().take(MAX_USERNAME_LENGTH).collect()),
        display_name: display_name.chars().take(MAX_DISPLAY_NAME_LENGTH).collect(),
        // Filled in by `Telegram::complete_author`, for a message it relays
        photo_id: None,
    })
}

/// A Telegram message's text as it's relayed into OpenChat, with labels for media, whose files
/// can only be fetched with the bot's token. Telegram has no `@everyone`, so the text can't
/// mention everyone in OpenChat.
pub fn inbound_text(message: &Message) -> String {
    let mut text = message
        .text
        .clone()
        .or_else(|| message.caption.clone())
        .unwrap_or_default();

    let label = if message.photo.is_some() {
        Some("[Photo]".to_string())
    } else if message.animation.is_some() {
        Some("[GIF]".to_string())
    } else if message.video.is_some() {
        Some("[Video]".to_string())
    } else if message.voice.is_some() {
        Some("[Voice message]".to_string())
    } else if message.audio.is_some() {
        Some("[Audio]".to_string())
    } else if let Some(document) = &message.document {
        Some(format!(
            "[File: {}]",
            document.file_name.as_deref().unwrap_or("file")
        ))
    } else if message.video_note.is_some() {
        Some("[Video message]".to_string())
    } else if let Some(venue) = &message.venue {
        Some(format!("[Venue: {}]", venue.title))
    } else if message.location.is_some() {
        Some("[Location]".to_string())
    } else if message.contact.is_some() {
        Some("[Contact]".to_string())
    } else if let Some(dice) = &message.dice {
        Some(format!("[{} {}]", dice.emoji, dice.value))
    } else if let Some(sticker) = &message.sticker {
        Some(match &sticker.emoji {
            Some(emoji) => format!("[Sticker {emoji}]"),
            None => "[Sticker]".to_string(),
        })
    } else {
        message
            .poll
            .as_ref()
            .map(|poll| format!("[Poll: {}]", poll.question))
    };
    if let Some(label) = label {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&label);
    }
    without_mention_everyone(text.trim())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn message(value: serde_json::Value) -> Message {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn only_the_bridge_commands_are_answered_in_groups() {
        assert!(is_group_command("bridge", None));
        assert!(is_group_command("bridge", Some("abc")));
        assert!(is_group_command("unbridge", None));
        assert!(is_group_command("status", None));
        assert!(!is_group_command("status", Some("is green")));
        assert!(!is_group_command("start", None));
        assert!(!is_group_command("unlink", None));
    }

    #[test]
    fn commands_addressed_to_other_bots_are_left() {
        assert_eq!(
            parse_command("/bridge", "OCBridgeBot"),
            Some(("bridge".to_string(), None))
        );
        assert_eq!(
            parse_command("/bridge@ocbridgebot", "OCBridgeBot"),
            Some(("bridge".to_string(), None))
        );
        assert_eq!(parse_command("/bridge@OtherBot", "OCBridgeBot"), None);
        assert_eq!(
            parse_command("/start abc123", "OCBridgeBot"),
            Some(("start".to_string(), Some("abc123".to_string())))
        );
        assert_eq!(
            parse_command("/status@OCBridgeBot", "OCBridgeBot"),
            Some(("status".to_string(), None))
        );
        // Linking is done from OpenChat, so /link is just a message
        assert_eq!(parse_command("/link", "OCBridgeBot"), None);
        assert_eq!(parse_command("/help", "OCBridgeBot"), None);
        assert_eq!(parse_command("hello", "OCBridgeBot"), None);
    }

    #[test]
    fn a_chat_sending_a_message_is_its_author() {
        let anonymous = message(json!({
            "message_id": 1,
            "chat": { "id": -100, "type": "supergroup", "title": "Example" },
            "from": { "id": 1087968824, "is_bot": true, "first_name": "Group" },
            "sender_chat": { "id": -100, "type": "supergroup", "title": "Example" },
            "text": "hi",
        }));
        let BridgedUser::Telegram(user) = author(&anonymous) else {
            panic!("Expected a Telegram user");
        };
        assert_eq!(user.id, -100);
        assert_eq!(user.display_name, "Example");

        let named = message(json!({
            "message_id": 1,
            "chat": { "id": -100, "type": "supergroup" },
            "from": { "id": 42, "is_bot": false, "first_name": "Nelly", "last_name": "Smith", "username": "nelly" },
            "text": "hi",
        }));
        let BridgedUser::Telegram(user) = author(&named) else {
            panic!("Expected a Telegram user");
        };
        assert_eq!(user.id, 42);
        assert_eq!(user.display_name, "Nelly Smith");
        assert_eq!(user.username.as_deref(), Some("nelly"));
    }

    #[test]
    fn media_are_labelled_and_everyone_isnt_mentioned() {
        let photo = message(json!({
            "message_id": 1,
            "chat": { "id": -100, "type": "supergroup" },
            "caption": "@everyone look",
            "photo": [{ "file_id": "x", "width": 1, "height": 1 }],
        }));
        assert_eq!(inbound_text(&photo), "@\u{200B}everyone look\n[Photo]");

        let venue = message(json!({
            "message_id": 1,
            "chat": { "id": -100, "type": "supergroup" },
            "location": { "latitude": 0.0, "longitude": 0.0 },
            "venue": { "title": "Café", "address": "1 Street", "location": { "latitude": 0.0, "longitude": 0.0 } },
        }));
        assert_eq!(inbound_text(&venue), "[Venue: Café]");

        let sticker = message(json!({
            "message_id": 1,
            "chat": { "id": -100, "type": "supergroup" },
            "sticker": { "emoji": "👍" },
        }));
        assert_eq!(inbound_text(&sticker), "[Sticker 👍]");
    }
}
