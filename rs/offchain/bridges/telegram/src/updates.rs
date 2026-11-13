use crate::api::{Chat, ChatShared, Keyboard, Message, TelegramApi, Update};
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
        // A channel's posts are its messages
        if let Some(message) = update.message.or(update.channel_post) {
            if let Some(new_chat_id) = message.migrate_to_chat_id {
                // Upgraded to a supergroup, which has a new id
                self.bridge
                    .move_pairing(&message.chat.id.to_string(), &new_chat_id.to_string())
                    .await?;
                return Ok(());
            }
            self.message(message).await
        } else if let Some(message) = update.edited_message.or(update.edited_channel_post) {
            self.edit(message).await
        } else {
            Ok(())
        }
    }

    async fn message(&self, message: Message) -> Result<()> {
        let is_private = message.chat.kind == "private";
        // Another bot's message, which Telegram only shows the bridge once Bot-to-Bot Communication
        // Mode is on, is relayed but never answered, as two bots answering each other could go on
        // forever. Nor is it a command, so a bot can't link itself, which would let it be tipped.
        let from_bot = is_from_bot(&message);
        if from_bot && is_private {
            return Ok(());
        }
        if let Some(shared) = message.chat_shared.as_ref().filter(|_| is_private) {
            let reply = self.channel_chosen(&message, shared).await;
            // The button it was chosen with is done with
            if let Err(error) = self
                .api
                .send_message_with_keyboard(message.chat.id, &reply, Keyboard::Remove)
                .await
            {
                warn!(%error, "Failed to reply to a chosen channel");
            }
            return Ok(());
        }
        if let Some((command, arg)) = self
            .command(&message)
            .filter(|_| !from_bot)
            .filter(|(command, arg)| is_private || is_group_command(command, arg.as_deref()))
        {
            if is_private && command == "bridge" {
                self.offer_channels(&message).await;
                return Ok(());
            }
            let reply = if is_private {
                self.private_command(&message, &command, arg).await
            } else {
                self.group_command(&message, &command).await
            };
            if let Some(reply) = reply {
                // In a group or channel, replying to the command shows whose it is
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
                OpenChat, then choose Link Telegram under Linked accounts. To bridge a group or \
                channel with OpenChat, run /bridge.";
            self.api.send_message(message.chat.id, help, None).await?;
            return Ok(());
        }
        // A bridged channel's posts, including the bridge's own, reach OpenChat through its
        // pairing, so their copies in its discussion group aren't relayed from there too
        if message.is_automatic_forward
            && let Some(channel) = &message.sender_chat
            && self
                .bridge
                .store
                .pairing(&channel.id.to_string())
                .await?
                .is_some()
        {
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
        message_command(message, &self.username)
    }

    async fn group_command(&self, message: &Message, command: &str) -> Option<String> {
        let chat = &message.chat;
        // Anyone in the group can see whether it's bridged
        if command == "status" {
            return Some(self.status(message, Some(chat)).await);
        }
        // Only a channel's admins can post in it, so they can unbridge it there. They post as the
        // channel, so the bridge can't tell which of them to send a code to, and they choose the
        // channel to bridge in a private chat with it instead.
        if chat.kind == "channel" {
            if command == "unbridge" {
                return self.unbridge(chat).await;
            }
            return Some(format!(
                "To bridge this channel with OpenChat, run /bridge in a private chat with me, at \
                t.me/{}, and choose the channel there.",
                self.username
            ));
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
            return self.unbridge(chat).await;
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
        let instructions = pairing_instructions(&pending.name, &code);
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
            ("unbridge", _) => {
                "Run /unbridge in the group or channel to stop bridging it.".to_string()
            }
            _ => "To link your Telegram account to OpenChat, open your profile in OpenChat, then \
                choose Link Telegram under Linked accounts. To bridge a group or channel with \
                OpenChat, run /bridge."
                .to_string(),
        })
    }

    /// /bridge in a private chat: a group's admins run it in the group, so this is for channels,
    /// which are chosen with a button
    async fn offer_channels(&self, message: &Message) {
        let text = "To bridge a channel with OpenChat, add me to it as an admin who can post \
            messages, then choose it below. To bridge a group, add me to it and run /bridge there \
            instead.";
        if let Err(error) = self
            .api
            .send_message_with_keyboard(message.chat.id, text, Keyboard::ChooseChannel)
            .await
        {
            warn!(%error, "Failed to offer the user's channels");
        }
    }

    /// Sends the code to bridge the channel the user chose, if they're one of its admins
    async fn channel_chosen(&self, message: &Message, shared: &ChatShared) -> String {
        let Some(from) = &message.from else {
            return "Something went wrong. Please try again.".to_string();
        };
        // Telegram lists the channels the bot is in, which may include those the user only reads
        match self.api.is_admin(shared.chat_id, from.id).await {
            Ok(true) => {}
            Ok(false) => return "Only the channel's admins can bridge it.".to_string(),
            Err(error) => {
                warn!(%error, "Failed to check whether a user is a channel's admin");
                return "Something went wrong. Check I'm one of the channel's admins, then run \
                    /bridge again."
                    .to_string();
            }
        }
        // Otherwise it would be paired, but nothing from OpenChat could be posted in it
        match self.api.can_post_in_channel(shared.chat_id).await {
            Ok(true) => {}
            Ok(false) => {
                return "I can't post in that channel. Make me one of its admins, able to post \
                    messages, then run /bridge again."
                    .to_string();
            }
            Err(error) => {
                warn!(%error, "Failed to check whether the bot can post in a channel");
                return "Something went wrong. Please run /bridge again.".to_string();
            }
        }
        let pending = PendingPairing {
            platform_chat: shared.chat_id.to_string(),
            name: shared
                .title
                .clone()
                .unwrap_or_else(|| "this channel".to_string()),
            platform_data: None,
        };
        match self.bridge.start_pairing(&pending).await {
            Ok(code) => pairing_instructions(&pending.name, &code),
            Err(error) => {
                warn!(%error, "Failed to start pairing");
                "Something went wrong. Please try again.".to_string()
            }
        }
    }

    async fn unbridge(&self, chat: &Chat) -> Option<String> {
        match self.bridge.unpair_platform_chat(&chat.id.to_string()).await {
            // Unpairing says so in the group or channel itself
            Ok(true) => None,
            Ok(false) => Some(format!(
                "This {} isn't bridged with OpenChat.",
                chat_noun(chat)
            )),
            Err(error) => {
                warn!(%error, "Failed to unbridge");
                Some("Something went wrong. Please try again.".to_string())
            }
        }
    }

    /// Whether the group or channel is bridged, when run in one, and whether the user's account is
    /// linked
    async fn status(&self, message: &Message, chat: Option<&Chat>) -> String {
        let mut lines = Vec::new();
        if let Some(chat) = chat {
            let noun = chat_noun(chat);
            lines.push(
                match self.bridge.store.pairing(&chat.id.to_string()).await {
                    Ok(Some(pairing)) => format!(
                        "This {noun} is bridged with {}.",
                        oc_chat_url(&pairing.oc_chat)
                    ),
                    Ok(None) => format!("This {noun} isn't bridged with OpenChat."),
                    Err(error) => {
                        warn!(%error, "Failed to look up a group's pairing");
                        return "Something went wrong. Please try again.".to_string();
                    }
                },
            );
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

/// What the code to bridge a group or channel is sent with, privately, as anyone who saw it could
/// pair the chat with an OpenChat chat of their own
fn pairing_instructions(name: &str, code: &str) -> String {
    format!(
        "To bridge {} with OpenChat, install the bridge bot in the OpenChat group or public \
        channel to bridge with, then run <code>/bridge {code}</code> there within 15 minutes.",
        escape(name)
    )
}

fn chat_noun(chat: &Chat) -> &'static str {
    if chat.kind == "channel" {
        "channel"
    } else {
        "group"
    }
}

/// The message's command, if it's one of this bot's. A channel's post copied into its discussion
/// group isn't one there, so a channel's /unbridge doesn't unbridge the group too.
fn message_command(message: &Message, username: &str) -> Option<(String, Option<String>)> {
    if message.is_automatic_forward {
        return None;
    }
    parse_command(message.text.as_deref()?, username)
}

/// Whether the bridge answers a command in a group or channel. The rest, eg. another bot's /start,
/// are relayed like any message. /status is a common name, so it's only taken on its own, not, say,
/// in "/status is green".
fn is_group_command(command: &str, arg: Option<&str>) -> bool {
    matches!(command, "bridge" | "unbridge") || (command == "status" && arg.is_none())
}

/// The command and its argument, if the text is one of this bot's commands. `/bridge@OtherBot` is
/// another bot's.
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

/// Who sent the message: a user, or a chat, eg. a channel, or a group's anonymous admins
pub fn author(message: &Message) -> BridgedUser {
    // A channel's posts are the channel's, which Telegram sets as their sender
    let sender_chat = message
        .sender_chat
        .as_ref()
        .or_else(|| (message.chat.kind == "channel").then_some(&message.chat));
    let (id, username, display_name) = match (sender_chat, &message.from) {
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
        // No one can link a bot, so OpenChat doesn't let anyone tip its messages
        bot: is_from_bot(message),
    })
}

/// Whether another bot sent the message. Not a group's anonymous admins, which Telegram sends as a
/// bot, but with the group as the sender.
fn is_from_bot(message: &Message) -> bool {
    message.sender_chat.is_none() && message.from.as_ref().is_some_and(|from| from.is_bot)
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
        // Telegram sends a group's anonymous admins as a bot, but they're the group
        assert!(!user.bot);
        assert!(!is_from_bot(&anonymous));

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
        assert!(!user.bot);
    }

    // No one can link a bot, so OpenChat doesn't let anyone tip its messages, and the bridge
    // doesn't answer it
    #[test]
    fn another_bots_message_is_flagged_as_a_bots() {
        let from_bot = message(json!({
            "message_id": 1,
            "chat": { "id": -100, "type": "supergroup" },
            "from": { "id": 7, "is_bot": true, "first_name": "Weather", "username": "weather_bot" },
            "text": "/status",
        }));
        let BridgedUser::Telegram(user) = author(&from_bot) else {
            panic!("Expected a Telegram user");
        };
        assert_eq!(user.id, 7);
        assert!(user.bot);
        assert!(is_from_bot(&from_bot));
    }

    #[test]
    fn a_channels_posts_are_the_channels() {
        let post = message(json!({
            "message_id": 1,
            "chat": { "id": -100456, "type": "channel", "title": "News" },
            "sender_chat": { "id": -100456, "type": "channel", "title": "News" },
            "author_signature": "Nelly",
            "text": "hi",
        }));
        let BridgedUser::Telegram(user) = author(&post) else {
            panic!("Expected a Telegram user");
        };
        assert_eq!(user.id, -100456);
        assert_eq!(user.display_name, "News");
        assert_eq!(user.username, None);

        // Without a sender, it's still the channel's, not an unknown user's
        let unsigned = message(json!({
            "message_id": 2,
            "chat": { "id": -100456, "type": "channel", "title": "News" },
            "text": "hi",
        }));
        let BridgedUser::Telegram(user) = author(&unsigned) else {
            panic!("Expected a Telegram user");
        };
        assert_eq!(user.id, -100456);
        assert_eq!(user.display_name, "News");
    }

    #[test]
    fn a_channels_commands_arent_commands_in_its_discussion_group() {
        let post = json!({
            "message_id": 1,
            "chat": { "id": -100456, "type": "channel", "title": "News" },
            "sender_chat": { "id": -100456, "type": "channel", "title": "News" },
            "text": "/unbridge",
        });
        assert_eq!(
            message_command(&message(post), "OCBridgeBot"),
            Some(("unbridge".to_string(), None))
        );

        let copy = message(json!({
            "message_id": 9,
            "chat": { "id": -100789, "type": "supergroup", "title": "News chat" },
            "from": { "id": 777000, "is_bot": false, "first_name": "Telegram" },
            "sender_chat": { "id": -100456, "type": "channel", "title": "News" },
            "is_automatic_forward": true,
            "text": "/unbridge",
        }));
        assert_eq!(message_command(&copy, "OCBridgeBot"), None);
    }

    #[test]
    fn the_code_is_sent_with_the_chats_name() {
        let instructions = pairing_instructions("News <daily>", "abc123");
        assert!(instructions.starts_with("To bridge News &lt;daily&gt; with OpenChat"));
        assert!(instructions.contains("<code>/bridge abc123</code>"));

        let chat = |kind: &str| Chat {
            id: -100,
            kind: kind.to_string(),
            title: None,
        };
        assert_eq!(chat_noun(&chat("channel")), "channel");
        assert_eq!(chat_noun(&chat("supergroup")), "group");
        assert_eq!(chat_noun(&chat("group")), "group");
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
