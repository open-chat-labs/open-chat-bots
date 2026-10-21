use crate::model::{Pairing, PlatformChatId, PlatformMessageId};
use crate::openchat::Author;
use anyhow::Result;
use async_trait::async_trait;
use oc_bots_sdk::types::{BridgePlatform, BridgedUser};

/// What each bridge does on its platform, eg. Discord
#[async_trait]
pub trait Platform: Send + Sync + 'static {
    const PLATFORM: BridgePlatform;
    /// As users see it, eg. "Discord"
    const NAME: &'static str;

    /// Posts a message relayed from OpenChat, returning its id on the platform
    async fn post(&self, pairing: &Pairing, message: &OutboundMessage)
    -> Result<PlatformMessageId>;

    async fn edit(&self, pairing: &Pairing, id: &str, message: &OutboundMessage) -> Result<()>;

    async fn delete(&self, pairing: &Pairing, id: &str) -> Result<()>;

    /// Once the chat is paired, eg. to say so in it
    async fn paired(&self, _pairing: &Pairing) -> Result<()> {
        Ok(())
    }

    /// Once a pairing is removed, eg. to remove a webhook created for it
    async fn unpaired(&self, _pairing: &Pairing) -> Result<()> {
        Ok(())
    }
}

/// A message to relay from OpenChat
#[derive(Clone, Debug)]
pub struct OutboundMessage {
    pub author: Author,
    /// Set if another bridge bot relayed the message into OpenChat, eg. from Telegram into a chat
    /// also bridged with Discord
    pub via: Option<BridgePlatform>,
    /// With mentions written as `@name`
    pub text: String,
    /// The message on the platform it replies to, if it's there
    pub reply_to: Option<PlatformMessageId>,
}

/// A message to relay into OpenChat
#[derive(Clone, Debug)]
pub struct InboundMessage {
    pub platform_chat: PlatformChatId,
    pub platform_message: PlatformMessageId,
    pub author: BridgedUser,
    pub text: String,
    pub reply_to: Option<PlatformMessageId>,
}

pub fn platform_name(platform: BridgePlatform) -> &'static str {
    match platform {
        BridgePlatform::Discord => "Discord",
        BridgePlatform::Telegram => "Telegram",
    }
}
