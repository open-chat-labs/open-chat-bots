use crate::api::{TwitchApi, helix_status};
use crate::profiles::Profiles;
use crate::rate_limit::RateLimiter;
use anyhow::{Result, anyhow};
use async_trait::async_trait;
use oc_bots_sdk::types::{BridgePlatform, BridgedUser};
use oc_bridge_core::util::oc_chat_url;
use oc_bridge_core::{
    OutboundMessage, Pairing, PermanentFailure, Platform, PlatformMessageId, platform_name,
};
use serde_json::json;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tracing::warn;

// Twitch's limit, in characters. Counted in UTF-16 code units, to be safe, as an emoji may count as
// two.
const MAX_MESSAGE_LENGTH: usize = 500;

/// What the bridge subscribes to in each paired channel's chat: its messages, and its moderators
/// deleting one, or clearing a user's when they're banned or timed out
pub const CHAT_EVENTS: [&str; 3] = [
    "channel.chat.message",
    "channel.chat.message_delete",
    "channel.chat.clear_user_messages",
];

pub struct Twitch {
    pub api: Arc<TwitchApi>,
    /// The Twitch account the bot chats as
    pub bot_id: String,
    pub bot_login: String,
    /// Where the bridge is served, whose `/bridge` page a broadcaster starts bridging from
    pub public_url: String,
    /// The conduit the bridge's subscriptions send their events through
    pub conduit_id: String,
    pub limiter: RateLimiter,
    pub profiles: Profiles,
    // The channels whose subscriptions the bridge has made sure of since it started
    subscribed: Mutex<HashSet<String>>,
}

#[async_trait]
impl Platform for Twitch {
    const PLATFORM: BridgePlatform = BridgePlatform::Twitch;
    const NAME: &'static str = "Twitch";

    // The bot is only in a channel's chat once its broadcaster has let it in, so it can't answer
    // there until then
    fn how_to_get_a_code() -> String {
        "Run /bridge here without a code to see how a Twitch channel's broadcaster gets one"
            .to_string()
    }

    fn how_to_get_a_new_code() -> String {
        "Run /bridge without a code to see how to get a new one.".to_string()
    }

    fn bridge_instructions(&self) -> String {
        bridge_instructions(&self.public_url, &self.bot_login)
    }

    async fn complete_author(&self, author: &mut BridgedUser) {
        if let BridgedUser::Twitch(user) = author {
            user.profile_image = self.profiles.image(user.id).await;
        }
    }

    async fn post(
        &self,
        pairing: &Pairing,
        message: &OutboundMessage,
    ) -> Result<PlatformMessageId> {
        self.ensure_subscribed(&pairing.platform_chat).await;
        self.say(
            &pairing.platform_chat,
            &chat_text(message),
            message.reply_to.as_deref(),
        )
        .await
    }

    // Twitch's messages can't be edited
    async fn edit(&self, _: &Pairing, _: &str, _: &OutboundMessage) -> Result<()> {
        Ok(())
    }

    async fn delete(&self, pairing: &Pairing, id: &str) -> Result<()> {
        match self
            .api
            .delete_chat_message(&pairing.platform_chat, &self.bot_id, id)
            .await
        {
            // The bot isn't a moderator there, or the message is gone or over 6 hours old
            Err(error) if matches!(helix_status(&error), Some(400 | 403 | 404)) => Ok(()),
            result => result,
        }
    }

    async fn paired(&self, pairing: &Pairing) -> Result<()> {
        // Subscribed when the code was given, but unsubscribed if the chat was unbridged since
        self.subscribe(&pairing.platform_chat).await?;
        let text = format!(
            "This chat is now bridged with OpenChat, so messages sent in either appear in both: {}",
            oc_chat_url(&pairing.oc_chat)
        );
        self.say(&pairing.platform_chat, &text, None).await?;
        Ok(())
    }

    async fn unpaired(&self, pairing: &Pairing) -> Result<()> {
        // Said before the bot leaves the chat. It may not be able to post there any more, eg. as the
        // pairing's being removed for that reason, but it still leaves.
        if let Err(error) = self
            .say(
                &pairing.platform_chat,
                "This chat is no longer bridged with OpenChat.",
                None,
            )
            .await
        {
            warn!(%error, "Failed to say the chat is no longer bridged");
        }
        self.unsubscribe(&pairing.platform_chat).await
    }
}

impl Twitch {
    pub fn new(
        api: Arc<TwitchApi>,
        bot_id: String,
        bot_login: String,
        public_url: String,
        conduit_id: String,
    ) -> Self {
        Twitch {
            profiles: Profiles::new(api.clone()),
            api,
            bot_id,
            bot_login,
            public_url,
            conduit_id,
            limiter: RateLimiter::default(),
            subscribed: Mutex::default(),
        }
    }

    /// Posts in the channel's chat as the bot, once Twitch's rate limits allow, returning the
    /// message's id. Twitch refusing it is a `PermanentFailure`.
    pub async fn say(
        &self,
        channel: &str,
        text: &str,
        reply_to: Option<&str>,
    ) -> Result<PlatformMessageId> {
        self.limiter.wait(channel).await?;
        let sent = match self
            .api
            .send_chat_message(channel, &self.bot_id, text, reply_to)
            .await
        {
            // The message replied to is gone, so it's sent on its own
            Err(error) if reply_to.is_some() && helix_status(&error) == Some(400) => {
                self.limiter.wait(channel).await?;
                self.api
                    .send_chat_message(channel, &self.bot_id, text, None)
                    .await
            }
            result => result,
        };

        match sent {
            Ok(sent) if sent.is_sent => Ok(sent.message_id),
            // eg. AutoMod held it, or the chat is in followers-only mode
            Ok(sent) => Err(PermanentFailure::Rejected(format!(
                "Twitch dropped the message: {}",
                sent.drop_reason
                    .map_or("no reason given".to_string(), |r| format!(
                        "{} ({})",
                        r.message, r.code
                    ))
            ))
            .into()),
            Err(error) => Err(match helix_status(&error) {
                // The bot may no longer post there, eg. as it was banned, or the broadcaster
                // revoked the app
                Some(403) => PermanentFailure::ChatGone.into(),
                Some(400 | 422) => PermanentFailure::Rejected(error.to_string()).into(),
                // Worth retrying, eg. rate limited, or Twitch was unavailable
                _ => anyhow!(error),
            }),
        }
    }

    /// Subscribes the bridge's conduit to the channel's chat. A subscription which exists already
    /// is left as it is.
    pub async fn subscribe(&self, channel: &str) -> Result<()> {
        let condition = json!({ "broadcaster_user_id": channel, "user_id": self.bot_id });
        for kind in CHAT_EVENTS {
            self.api
                .subscribe(kind, condition.clone(), &self.conduit_id)
                .await?;
        }
        self.subscribed.lock().unwrap().insert(channel.to_string());
        Ok(())
    }

    /// So the bot leaves the channel's chat
    pub async fn unsubscribe(&self, channel: &str) -> Result<()> {
        self.subscribed.lock().unwrap().remove(channel);
        for subscription in self.api.subscriptions_for_user(channel).await? {
            if CHAT_EVENTS.contains(&subscription.kind.as_str())
                && subscription.condition["broadcaster_user_id"] == channel
            {
                self.api.unsubscribe(&subscription.id).await?;
            }
        }
        Ok(())
    }

    // Once per channel since the bridge started, in case its subscriptions were lost, eg. as Twitch
    // deleted the conduit while the bridge was down for days
    async fn ensure_subscribed(&self, channel: &str) {
        if self.subscribed.lock().unwrap().contains(channel) {
            return;
        }
        if let Err(error) = self.subscribe(channel).await {
            warn!(%error, channel, "Failed to subscribe to a channel's chat");
        }
    }
}

/// The bot can't post as anyone else, so each message starts with its author's name, eg.
/// "Nelly: hello". Twitch shows a message on one line, so its lines are joined.
pub fn chat_text(message: &OutboundMessage) -> String {
    // Without anything which could read as a chat command, eg. "/ban"
    let mut name = message
        .author
        .name
        .trim()
        .trim_start_matches(['/', '.'])
        .trim()
        .to_string();
    if name.is_empty() {
        name = "OpenChat user".to_string();
    }
    if let Some(via) = message.via {
        name = format!("{name} ({})", platform_name(via));
    }
    let text = message
        .text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    truncate(format!("{name}: {text}"), MAX_MESSAGE_LENGTH)
}

fn truncate(text: String, max_length: usize) -> String {
    if text.encode_utf16().count() <= max_length {
        return text;
    }
    let mut truncated = String::new();
    let mut length = 0;
    for c in text.chars() {
        // Leaving room for the ellipsis
        if length + c.len_utf16() > max_length - 1 {
            break;
        }
        length += c.len_utf16();
        truncated.push(c);
    }
    truncated.push('…');
    truncated
}

// Only the broadcaster can let the bot into their chat. Codes are given on the bridge's page rather
// than in chat, which everyone watching can see.
fn bridge_instructions(public_url: &str, bot_login: &str) -> String {
    format!(
        "To bridge this chat with a Twitch channel's chat:\n\
        1. The channel's broadcaster signs in with Twitch at {public_url}/bridge, which lets the bot, \
        {bot_login}, into their chat and gives them a code.\n\
        2. Run `/bridge <code>` here within 15 minutes.\n\
        Making {bot_login} a moderator in the channel lets it relay more messages, and delete there \
        what's deleted here."
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use oc_bridge_core::Author;

    fn message(name: &str, text: &str) -> OutboundMessage {
        OutboundMessage {
            author: Author {
                name: name.to_string(),
                avatar_url: None,
            },
            via: None,
            text: text.to_string(),
            reply_to: None,
        }
    }

    #[test]
    fn the_author_is_named_before_the_text() {
        assert_eq!(chat_text(&message("Nelly", "hello")), "Nelly: hello");
        assert_eq!(chat_text(&message("  ", "hello")), "OpenChat user: hello");

        let mut via_discord = message("Nelly", "hi");
        via_discord.via = Some(BridgePlatform::Discord);
        assert_eq!(chat_text(&via_discord), "Nelly (Discord): hi");
    }

    #[test]
    fn a_name_cant_make_the_message_a_chat_command() {
        assert_eq!(chat_text(&message("/ban nelly", "hi")), "ban nelly: hi");
        assert_eq!(chat_text(&message("./", "hi")), "OpenChat user: hi");
    }

    #[test]
    fn lines_are_joined() {
        assert_eq!(
            chat_text(&message("Nelly", "first\n\n second \nthird")),
            "Nelly: first second third"
        );
        // eg. an image with a caption
        assert_eq!(
            chat_text(&message(
                "Nelly",
                "Look\n[image](https://abc.raw.icp0.io/blobs/1)"
            )),
            "Nelly: Look [image](https://abc.raw.icp0.io/blobs/1)"
        );
    }

    #[test]
    fn long_text_fits_twitchs_limit() {
        let text = chat_text(&message("Nelly", &"😀".repeat(400)));
        assert_eq!(text.encode_utf16().count(), MAX_MESSAGE_LENGTH);
        assert!(text.starts_with("Nelly: 😀"));
        assert!(text.ends_with('…'));
    }

    #[test]
    fn the_instructions_link_to_the_bridges_page() {
        let instructions = bridge_instructions("https://bridge.example.com", "openchatbridge");
        assert!(instructions.contains("https://bridge.example.com/bridge"));
        assert!(instructions.contains("`/bridge <code>`"));
        assert!(instructions.contains("Making openchatbridge a moderator"));
    }
}
