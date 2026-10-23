use crate::platform::Twitch;
use anyhow::{Context, Result};
use oc_bots_sdk::types::{BridgedUser, TwitchUser};
use oc_bridge_core::util::{oc_chat_url, without_mention_everyone};
use oc_bridge_core::{Bridge, InboundMessage};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use tracing::info;

// What OpenChat accepts as a Twitch user's display name
const MAX_DISPLAY_NAME_LENGTH: usize = 64;
// The messages kept per channel, so those a ban or timeout clears can be deleted in OpenChat. A
// busy chat sends more in a minute.
const RECENT_MESSAGES_PER_CHANNEL: usize = 500;

/// `channel.chat.message`
#[derive(Deserialize, Debug)]
pub struct ChatMessageEvent {
    pub broadcaster_user_id: String,
    pub chatter_user_id: String,
    pub chatter_user_login: String,
    /// The chatter's display name
    pub chatter_user_name: String,
    pub message_id: String,
    pub message: ChatMessage,
    #[serde(default)]
    pub badges: Vec<Badge>,
    pub reply: Option<Reply>,
    /// Set if the message was sent in another channel of a Shared Chat session
    pub source_broadcaster_user_id: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct ChatMessage {
    pub text: String,
    #[serde(default)]
    pub fragments: Vec<Fragment>,
}

#[derive(Deserialize, Debug)]
pub struct Fragment {
    pub gif: Option<Gif>,
}

#[derive(Deserialize, Debug)]
pub struct Gif {
    pub url: String,
}

#[derive(Deserialize, Debug)]
pub struct Badge {
    pub set_id: String,
}

#[derive(Deserialize, Debug)]
pub struct Reply {
    pub parent_message_id: String,
    pub parent_user_id: String,
    pub parent_user_login: String,
}

/// `channel.chat.message_delete`, when a moderator deletes a message
#[derive(Deserialize, Debug)]
pub struct MessageDeleteEvent {
    pub broadcaster_user_id: String,
    pub message_id: String,
}

/// `channel.chat.clear_user_messages`, when a user is banned or timed out
#[derive(Deserialize, Debug)]
pub struct ClearUserMessagesEvent {
    pub broadcaster_user_id: String,
    pub target_user_id: String,
}

/// The bridge's commands in a Twitch chat. Only the broadcaster and moderators can run them. Anyone
/// else's are relayed like any message.
#[derive(Debug, PartialEq)]
pub enum Command {
    /// Says how to bridge the chat
    Bridge,
    Unbridge,
}

/// Relays what happens in paired channels' chats into OpenChat, and handles the bridge's commands
pub struct ChatHandler {
    pub bridge: Arc<Bridge<Twitch>>,
    // Each channel's latest messages, by their authors
    recent: Mutex<HashMap<String, VecDeque<(String, String)>>>,
}

impl ChatHandler {
    pub fn new(bridge: Arc<Bridge<Twitch>>) -> Self {
        ChatHandler {
            bridge,
            recent: Mutex::default(),
        }
    }

    /// Handles an event of one of the types in `CHAT_EVENTS`
    pub async fn handle(&self, kind: &str, event: Value) -> Result<()> {
        match kind {
            "channel.chat.message" => self.message(serde_json::from_value(event)?).await,
            "channel.chat.message_delete" => {
                let event: MessageDeleteEvent = serde_json::from_value(event)?;
                self.bridge
                    .relay_inbound_delete(&event.broadcaster_user_id, &event.message_id)
                    .await
            }
            "channel.chat.clear_user_messages" => {
                let event: ClearUserMessagesEvent = serde_json::from_value(event)?;
                for message_id in self.forget(&event.broadcaster_user_id, &event.target_user_id) {
                    self.bridge
                        .relay_inbound_delete(&event.broadcaster_user_id, &message_id)
                        .await?;
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }

    /// Twitch revoked a subscription, eg. as the broadcaster revoked the app's access, or banned the
    /// bot. Without the chat's messages, the chat can't be bridged, so it's unpaired.
    pub async fn revoked(&self, kind: &str, condition: &Value, status: &str) -> Result<()> {
        if kind != "channel.chat.message" {
            return Ok(());
        }
        let channel = condition["broadcaster_user_id"]
            .as_str()
            .context("The subscription has no broadcaster")?;
        if self.bridge.unpair_platform_chat(channel).await? {
            info!(
                channel,
                status, "Unpaired, as Twitch revoked the subscription to the chat"
            );
        }
        Ok(())
    }

    async fn message(&self, event: ChatMessageEvent) -> Result<()> {
        let platform = &self.bridge.platform;
        let channel = &event.broadcaster_user_id;
        // Its own messages, which show whether it's a moderator or VIP there
        if event.chatter_user_id == platform.bot_id {
            platform
                .limiter
                .set_privileged(channel, is_privileged(&event.badges));
            return Ok(());
        }
        // Sent in another channel of a Shared Chat session, which hasn't agreed to be bridged
        if event
            .source_broadcaster_user_id
            .as_ref()
            .is_some_and(|source| source != channel)
        {
            return Ok(());
        }
        if let Some(command) = command(&event.message.text)
            && can_run_commands(&event.badges)
        {
            return self.command(&event, command).await;
        }

        self.remember(channel, &event.chatter_user_id, &event.message_id);
        self.bridge
            .relay_inbound(InboundMessage {
                platform_chat: channel.clone(),
                platform_message: event.message_id.clone(),
                author: author(&event)?,
                text: inbound_text(&event, &platform.bot_id),
                reply_to: event.reply.as_ref().map(|r| r.parent_message_id.clone()),
            })
            .await
    }

    async fn command(&self, event: &ChatMessageEvent, command: Command) -> Result<()> {
        let platform = &self.bridge.platform;
        let channel = &event.broadcaster_user_id;
        let reply = match command {
            Command::Bridge => {
                let bridged = match self.bridge.store.pairing(channel).await? {
                    Some(pairing) => format!(
                        "This chat is bridged with {}. ",
                        oc_chat_url(&pairing.oc_chat)
                    ),
                    None => String::new(),
                };
                Some(format!(
                    "{bridged}To bridge it with an OpenChat group or channel, the broadcaster signs \
                    in at {}/bridge",
                    platform.public_url
                ))
            }
            // Unpairing says so in the chat itself
            Command::Unbridge => (!self.bridge.unpair_platform_chat(channel).await?)
                .then(|| "This chat isn't bridged with OpenChat.".to_string()),
        };
        if let Some(reply) = reply {
            platform
                .say(channel, &reply, Some(&event.message_id))
                .await?;
        }
        Ok(())
    }

    fn remember(&self, channel: &str, user_id: &str, message_id: &str) {
        let mut recent = self.recent.lock().unwrap();
        let messages = recent.entry(channel.to_string()).or_default();
        if messages.len() >= RECENT_MESSAGES_PER_CHANNEL {
            messages.pop_front();
        }
        messages.push_back((user_id.to_string(), message_id.to_string()));
    }

    // The user's recent messages in the channel, which Twitch has cleared
    fn forget(&self, channel: &str, user_id: &str) -> Vec<String> {
        let mut recent = self.recent.lock().unwrap();
        let Some(messages) = recent.get_mut(channel) else {
            return Vec::new();
        };
        let mut cleared = Vec::new();
        messages.retain(|(author, message_id)| {
            let theirs = author == user_id;
            if theirs {
                cleared.push(message_id.clone());
            }
            !theirs
        });
        cleared
    }
}

/// The bridge's command, if the message is one. Only its first word counts.
pub fn command(text: &str) -> Option<Command> {
    let word = text.split_whitespace().next()?.to_lowercase();
    match word.as_str() {
        "!bridge" => Some(Command::Bridge),
        "!unbridge" => Some(Command::Unbridge),
        _ => None,
    }
}

// The broadcaster and their moderators manage the chat
fn can_run_commands(badges: &[Badge]) -> bool {
    badges.iter().any(|b| {
        matches!(
            b.set_id.as_str(),
            "broadcaster" | "moderator" | "lead_moderator"
        )
    })
}

// Twitch lets the bot send more where it's a moderator or VIP
fn is_privileged(badges: &[Badge]) -> bool {
    badges.iter().any(|b| {
        matches!(
            b.set_id.as_str(),
            "broadcaster" | "moderator" | "lead_moderator" | "vip"
        )
    })
}

/// Who sent the message. Their profile image is filled in by `Twitch::complete_author`, for a
/// message which is relayed.
pub fn author(event: &ChatMessageEvent) -> Result<BridgedUser> {
    let display_name = match event.chatter_user_name.trim() {
        "" => event.chatter_user_login.clone(),
        name => name.chars().take(MAX_DISPLAY_NAME_LENGTH).collect(),
    };
    Ok(BridgedUser::Twitch(TwitchUser {
        id: event
            .chatter_user_id
            .parse()
            .context("The chatter's Twitch id isn't a number")?,
        // As Twitch's logins are, and OpenChat requires
        login: event.chatter_user_login.to_lowercase(),
        display_name,
        profile_image: None,
    }))
}

/// A Twitch message's text as it's relayed into OpenChat, with a link to any GIF. Twitch has no
/// `@everyone`, so the text can't mention everyone in OpenChat.
pub fn inbound_text(event: &ChatMessageEvent, bot_id: &str) -> String {
    let mut text = event.message.text.trim();
    // Twitch starts a reply with a mention of whoever it replies to. A reply to the bot is to an
    // OpenChat message, whose author OpenChat shows with the reply, so the bot isn't mentioned.
    if let Some(reply) = &event.reply
        && reply.parent_user_id == bot_id
    {
        let mention = format!("@{}", reply.parent_user_login);
        if text
            .get(..mention.len())
            .is_some_and(|start| start.eq_ignore_ascii_case(&mention))
        {
            text = text[mention.len()..].trim_start();
        }
    }

    let mut text = text.to_string();
    for gif in event
        .message
        .fragments
        .iter()
        .filter_map(|f| f.gif.as_ref())
    {
        text.push_str(&format!("\n[GIF]({})", gif.url));
    }
    without_mention_everyone(text.trim())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event(value: Value) -> ChatMessageEvent {
        let mut event = json!({
            "broadcaster_user_id": "1971641",
            "broadcaster_user_login": "streamer",
            "broadcaster_user_name": "streamer",
            "chatter_user_id": "4145994",
            "chatter_user_login": "viewer32",
            "chatter_user_name": "Viewer32",
            "message_id": "cc106a89-1814-919d-454c-f4f2f970aae7",
            "message": {
                "text": "Hi chat",
                "fragments": [{ "type": "text", "text": "Hi chat", "cheermote": null, "emote": null, "mention": null }],
            },
            "color": "#00FF7F",
            "badges": [{ "set_id": "subscriber", "id": "12", "info": "16" }],
            "message_type": "text",
            "cheer": null,
            "reply": null,
            "channel_points_custom_reward_id": null,
            "source_broadcaster_user_id": null,
            "source_broadcaster_user_login": null,
            "source_broadcaster_user_name": null,
            "source_message_id": null,
            "source_badges": null,
        });
        for (key, value) in value.as_object().unwrap() {
            event[key] = value.clone();
        }
        serde_json::from_value(event).unwrap()
    }

    #[test]
    fn the_chatter_is_the_author() {
        let BridgedUser::Twitch(user) = author(&event(json!({}))).unwrap() else {
            panic!("Expected a Twitch user");
        };
        assert_eq!(
            user,
            TwitchUser {
                id: 4145994,
                login: "viewer32".to_string(),
                display_name: "Viewer32".to_string(),
                profile_image: None,
            }
        );

        // A localized display name, which is kept to what OpenChat accepts
        let localized = event(json!({ "chatter_user_name": "ネ".repeat(70) }));
        let BridgedUser::Twitch(user) = author(&localized).unwrap() else {
            panic!("Expected a Twitch user");
        };
        assert_eq!(user.display_name.chars().count(), MAX_DISPLAY_NAME_LENGTH);

        let unnamed = event(json!({ "chatter_user_name": "" }));
        let BridgedUser::Twitch(user) = author(&unnamed).unwrap() else {
            panic!("Expected a Twitch user");
        };
        assert_eq!(user.display_name, "viewer32");
    }

    #[test]
    fn everyone_isnt_mentioned_and_gifs_are_linked() {
        let message = event(json!({
            "message": {
                "text": "@everyone look",
                "fragments": [
                    { "type": "text", "text": "@everyone look" },
                    { "type": "gif", "text": "", "gif": { "id": "1", "url": "https://media.example.com/1.gif" } },
                ],
            },
        }));
        assert_eq!(
            inbound_text(&message, "999"),
            "@\u{200B}everyone look\n[GIF](https://media.example.com/1.gif)"
        );
    }

    #[test]
    fn a_reply_to_the_bot_doesnt_mention_it() {
        let reply = |parent_user_id: &str, parent_user_login: &str, text: &str| {
            event(json!({
                "message": { "text": text, "fragments": [] },
                "reply": {
                    "parent_message_id": "c060763a-c0d7-4b1f-ae8b-7b1e41e4f0b4",
                    "parent_message_body": "Nelly: hello",
                    "parent_user_id": parent_user_id,
                    "parent_user_name": parent_user_login,
                    "parent_user_login": parent_user_login,
                    "thread_message_id": "c060763a-c0d7-4b1f-ae8b-7b1e41e4f0b4",
                    "thread_user_id": parent_user_id,
                    "thread_user_name": parent_user_login,
                    "thread_user_login": parent_user_login,
                },
            }))
        };
        // Relayed from OpenChat by the bot
        assert_eq!(
            inbound_text(&reply("999", "ocbridge", "@OCBridge hi Nelly"), "999"),
            "hi Nelly"
        );
        // A Twitch user's is kept, as on Twitch
        assert_eq!(
            inbound_text(&reply("123", "nelly", "@nelly hi"), "999"),
            "@nelly hi"
        );
        // Without the mention, eg. if Twitch stops adding it
        assert_eq!(inbound_text(&reply("999", "ocbridge", "hi"), "999"), "hi");
    }

    #[test]
    fn commands_are_the_first_word() {
        assert_eq!(command("!bridge"), Some(Command::Bridge));
        assert_eq!(command("  !UNBRIDGE now"), Some(Command::Unbridge));
        assert_eq!(command("let's !bridge"), None);
        assert_eq!(command("!bridges"), None);
        assert_eq!(command(""), None);
    }

    #[test]
    fn only_the_broadcaster_and_moderators_run_commands() {
        let badges = |set_ids: &[&str]| -> Vec<Badge> {
            set_ids
                .iter()
                .map(|set_id| Badge {
                    set_id: set_id.to_string(),
                })
                .collect()
        };
        assert!(can_run_commands(&badges(&["broadcaster", "subscriber"])));
        assert!(can_run_commands(&badges(&["moderator"])));
        assert!(!can_run_commands(&badges(&["vip", "subscriber"])));
        assert!(!can_run_commands(&[]));

        // A VIP can't run them, but the bot can send more as one
        assert!(is_privileged(&badges(&["vip"])));
        assert!(!is_privileged(&badges(&["subscriber"])));
    }

    #[test]
    fn a_shared_chats_messages_say_where_they_were_sent() {
        let shared = event(json!({ "source_broadcaster_user_id": "222" }));
        assert_eq!(shared.source_broadcaster_user_id.as_deref(), Some("222"));
        assert_eq!(event(json!({})).source_broadcaster_user_id, None);
    }
}
