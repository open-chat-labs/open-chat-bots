use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;
use oc_bots_sdk::types::BridgePlatform;
use oc_bridge_core::platform::PermanentFailure;
use oc_bridge_core::{OutboundMessage, Pairing, Platform, PlatformMessageId, platform_name};
use serde::{Deserialize, Serialize};
use serde_json::json;
use serenity::http::{Http, HttpError};
use serenity::model::id::{ChannelId, MessageId, WebhookId};
use std::sync::Arc;

// Discord's limits
const MAX_CONTENT_LENGTH: usize = 2000;
const MAX_USERNAME_LENGTH: usize = 80;

/// What a paired Discord channel needs, kept in its pairing: the webhook the bridge posts OpenChat's
/// messages with, as their authors
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiscordPairing {
    pub guild_id: u64,
    pub webhook_id: u64,
    pub webhook_token: String,
}

impl DiscordPairing {
    pub fn from_pairing(pairing: &Pairing) -> Result<Self> {
        let data = pairing
            .platform_data
            .as_deref()
            .context("The pairing has no webhook")?;
        Ok(serde_json::from_str(data)?)
    }
}

pub struct Discord {
    pub http: Arc<Http>,
}

#[async_trait]
impl Platform for Discord {
    const PLATFORM: BridgePlatform = BridgePlatform::Discord;
    const NAME: &'static str = "Discord";

    async fn post(
        &self,
        pairing: &Pairing,
        message: &OutboundMessage,
    ) -> Result<PlatformMessageId> {
        let webhook = DiscordPairing::from_pairing(pairing)?;
        let content = content(&webhook, pairing, message);
        let mut body = json!({
            "content": content,
            "username": username(message),
            // Mentions are shown, but don't ping anyone on Discord
            "allowed_mentions": { "parse": [] },
        });
        if let Some(avatar_url) = &message.author.avatar_url {
            body["avatar_url"] = json!(avatar_url);
        }

        let posted = self
            .http
            .execute_webhook(
                WebhookId::new(webhook.webhook_id),
                None,
                &webhook.webhook_token,
                true,
                Vec::new(),
                &body,
            )
            .await
            .map_err(discord_error)?
            .context("Discord didn't return the posted message")?;
        Ok(posted.id.to_string())
    }

    async fn edit(&self, pairing: &Pairing, id: &str, message: &OutboundMessage) -> Result<()> {
        let webhook = DiscordPairing::from_pairing(pairing)?;
        let body = json!({
            "content": content(&webhook, pairing, message),
            // Without it, Discord would ping the mentions in the edited text
            "allowed_mentions": { "parse": [] },
        });
        let result = self
            .http
            .edit_webhook_message(
                WebhookId::new(webhook.webhook_id),
                None,
                &webhook.webhook_token,
                MessageId::new(id.parse()?),
                &body,
                Vec::new(),
            )
            .await
            .map(|_| ());
        ignore_not_found(result)
    }

    async fn delete(&self, pairing: &Pairing, id: &str) -> Result<()> {
        let webhook = DiscordPairing::from_pairing(pairing)?;
        let result = self
            .http
            .delete_webhook_message(
                WebhookId::new(webhook.webhook_id),
                None,
                &webhook.webhook_token,
                MessageId::new(id.parse()?),
            )
            .await;
        ignore_not_found(result)
    }

    async fn paired(&self, pairing: &Pairing) -> Result<()> {
        ChannelId::new(pairing.platform_chat.parse()?)
            .say(&self.http, "This channel is now bridged with OpenChat.")
            .await
            .map_err(discord_error)?;
        Ok(())
    }

    async fn unpaired(&self, pairing: &Pairing) -> Result<()> {
        let webhook = DiscordPairing::from_pairing(pairing)?;
        self.http
            .delete_webhook_with_token(
                WebhookId::new(webhook.webhook_id),
                &webhook.webhook_token,
                Some("No longer bridged with OpenChat"),
            )
            .await
            .map_err(discord_error)?;
        Ok(())
    }
}

// A copy already deleted on Discord, eg. by a moderator, has nothing left to edit or delete
fn ignore_not_found(result: serenity::Result<()>) -> Result<()> {
    match result {
        Err(serenity::Error::Http(error))
            if error
                .status_code()
                .is_some_and(|status| status.as_u16() == 404) =>
        {
            Ok(())
        }
        result => result.map_err(discord_error),
    }
}

// Discord's errors without their urls, which contain the webhook's token. A refusal which
// retrying won't fix is a `PermanentFailure`, and a missing webhook or channel means the chat is
// gone.
fn discord_error(error: serenity::Error) -> anyhow::Error {
    match error {
        serenity::Error::Http(HttpError::UnsuccessfulRequest(response)) => {
            let status = response.status_code.as_u16();
            let message = format!("Discord returned {status}: {}", response.error.message);
            match status {
                404 => PermanentFailure::ChatGone.into(),
                // Rate limited, so worth retrying
                429 => anyhow!(message),
                400..=499 => PermanentFailure::Rejected(message).into(),
                _ => anyhow!(message),
            }
        }
        serenity::Error::Http(HttpError::Request(error)) => anyhow!(error.without_url()),
        error => anyhow!("{error}"),
    }
}

// Webhooks can't reply, so a reply links to the message it replies to
fn content(webhook: &DiscordPairing, pairing: &Pairing, message: &OutboundMessage) -> String {
    let mut content = String::new();
    if let Some(reply_to) = &message.reply_to {
        content.push_str(&format!(
            "-# ↪ [Reply](https://discord.com/channels/{}/{}/{reply_to})\n",
            webhook.guild_id, pairing.platform_chat
        ));
    }
    content.push_str(&message.text);
    truncate(content, MAX_CONTENT_LENGTH)
}

// Discord rejects webhook names containing "discord" or "clyde"
fn username(message: &OutboundMessage) -> String {
    let mut name = message.author.name.trim().to_string();
    if name.is_empty() {
        name = "OpenChat user".to_string();
    }
    if let Some(via) = message.via {
        name = format!("{name} ({})", platform_name(via));
    }
    for word in ["discord", "clyde"] {
        name = mask_word(&name, word);
    }
    truncate(name, MAX_USERNAME_LENGTH)
}

// Replaces the second letter of each occurrence of `word`, an ASCII word, with "*", keeping the
// rest as written, eg. "Discord" becomes "D*scord"
fn mask_word(text: &str, word: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let mut result = String::new();
    let mut last = 0;
    for (start, _) in lower.match_indices(word) {
        result.push_str(&text[last..start + 1]);
        result.push('*');
        last = start + 2;
    }
    result.push_str(&text[last..]);
    result
}

fn truncate(text: String, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text;
    }
    let mut truncated: String = text.chars().take(max_chars - 1).collect();
    truncated.push('…');
    truncated
}

#[cfg(test)]
mod tests {
    use super::*;
    use oc_bridge_core::Author;

    fn message(name: &str) -> OutboundMessage {
        OutboundMessage {
            author: Author {
                name: name.to_string(),
                avatar_url: None,
            },
            via: None,
            text: "hello".to_string(),
            reply_to: None,
        }
    }

    #[test]
    fn usernames_avoid_words_discord_rejects() {
        assert_eq!(username(&message("Nelly")), "Nelly");
        assert_eq!(username(&message("My Discord Name")), "My D*scord Name");
        assert_eq!(username(&message("  ")), "OpenChat user");

        let mut via_telegram = message("Nelly");
        via_telegram.via = Some(BridgePlatform::Telegram);
        assert_eq!(username(&via_telegram), "Nelly (Telegram)");
    }

    #[test]
    fn long_text_is_truncated_to_discords_limit() {
        let text = truncate("x".repeat(3000), MAX_CONTENT_LENGTH);
        assert_eq!(text.chars().count(), MAX_CONTENT_LENGTH);
        assert!(text.ends_with('…'));
        assert_eq!(truncate("short".to_string(), 10), "short");
    }
}
