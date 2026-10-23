use crate::api::TelegramApi;
use crate::avatars::Avatars;
use anyhow::Result;
use async_trait::async_trait;
use oc_bots_sdk::types::{BridgePlatform, BridgedUser};
use oc_bridge_core::util::oc_chat_url;
use oc_bridge_core::{
    OutboundMessage, Pairing, PermanentFailure, Platform, PlatformMessageId, platform_name,
};
use std::sync::Arc;

// Telegram's limit, on the text as shown rather than its HTML
const MAX_TEXT_LENGTH: usize = 4096;

pub struct Telegram {
    pub api: Arc<TelegramApi>,
    /// None if there's no bucket to copy users' photos to
    pub avatars: Option<Avatars>,
}

#[async_trait]
impl Platform for Telegram {
    const PLATFORM: BridgePlatform = BridgePlatform::Telegram;
    const NAME: &'static str = "Telegram";

    async fn complete_author(&self, author: &mut BridgedUser) {
        // A chat, eg. a channel or a group's anonymous admins, has a negative id, and Telegram's
        // `getUserProfilePhotos` only takes users'
        if let (BridgedUser::Telegram(user), Some(avatars)) = (author, &self.avatars)
            && user.id > 0
        {
            user.photo_id = avatars.photo_id(user.id).await;
        }
    }

    async fn post(
        &self,
        pairing: &Pairing,
        message: &OutboundMessage,
    ) -> Result<PlatformMessageId> {
        let reply_to = message.reply_to.as_deref().map(str::parse).transpose()?;
        let sent = self
            .api
            .send_message(pairing.platform_chat.parse()?, &html(message), reply_to)
            .await?;
        Ok(sent.message_id.to_string())
    }

    async fn edit(&self, pairing: &Pairing, id: &str, message: &OutboundMessage) -> Result<()> {
        let result = self
            .api
            .edit_message_text(pairing.platform_chat.parse()?, id.parse()?, &html(message))
            .await;
        // Unchanged, or deleted on Telegram since
        ignore_if(
            result,
            &["message is not modified", "message to edit not found"],
        )
    }

    async fn delete(&self, pairing: &Pairing, id: &str) -> Result<()> {
        let result = self
            .api
            .delete_message(pairing.platform_chat.parse()?, id.parse()?)
            .await;
        ignore_if(result, &["message to delete not found"])
    }

    async fn paired(&self, pairing: &Pairing) -> Result<()> {
        let text = format!(
            "This chat is now bridged with OpenChat, so messages sent in either appear in both: {}",
            escape(&oc_chat_url(&pairing.oc_chat))
        );
        self.api
            .send_message(pairing.platform_chat.parse()?, &text, None)
            .await?;
        Ok(())
    }

    // The chat may be gone, eg. as the pairing's being removed for that reason
    async fn unpaired(&self, pairing: &Pairing) -> Result<()> {
        self.api
            .send_message(
                pairing.platform_chat.parse()?,
                "This chat is no longer bridged with OpenChat.",
                None,
            )
            .await?;
        Ok(())
    }
}

fn ignore_if(result: Result<()>, descriptions: &[&str]) -> Result<()> {
    match result {
        Err(error)
            if matches!(
                error.downcast_ref::<PermanentFailure>(),
                Some(PermanentFailure::Rejected(reason))
                    if descriptions.iter().any(|d| reason.contains(d))
            ) =>
        {
            Ok(())
        }
        result => result,
    }
}

/// A bot can't post as another user on Telegram, so each message starts with its author's name
pub fn html(message: &OutboundMessage) -> String {
    let mut name = message.author.name.trim().to_string();
    if name.is_empty() {
        name = "OpenChat user".to_string();
    }
    if let Some(via) = message.via {
        name = format!("{name} ({})", platform_name(via));
    }

    // Counted in UTF-16 code units, to be safe, as Telegram counts entities' offsets that way
    let budget = MAX_TEXT_LENGTH.saturating_sub(name.encode_utf16().count() + 1);
    let text = if message.text.encode_utf16().count() > budget {
        let mut text = String::new();
        let mut length = 0;
        for c in message.text.chars() {
            // Leaving room for the ellipsis
            if length + c.len_utf16() > budget.saturating_sub(1) {
                break;
            }
            length += c.len_utf16();
            text.push(c);
        }
        text.push('…');
        text
    } else {
        message.text.clone()
    };
    format!("<b>{}</b>\n{}", escape(&name), escape(&text))
}

pub(crate) fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
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
    fn the_author_is_shown_and_html_escaped() {
        assert_eq!(
            html(&message("Nelly <3", "a < b & c")),
            "<b>Nelly &lt;3</b>\na &lt; b &amp; c"
        );

        let mut via_discord = message("Nelly", "hi");
        via_discord.via = Some(BridgePlatform::Discord);
        assert_eq!(html(&via_discord), "<b>Nelly (Discord)</b>\nhi");
    }

    #[test]
    fn long_text_fits_telegrams_limit_once_shown() {
        let shown = html(&message("Nelly", &"&".repeat(5000)));
        let visible = shown
            .replace("<b>", "")
            .replace("</b>", "")
            .replace("&amp;", "&");
        assert_eq!(visible.chars().count(), MAX_TEXT_LENGTH);
        assert!(visible.ends_with('…'));
    }
}
