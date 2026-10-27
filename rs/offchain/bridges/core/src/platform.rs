use crate::model::{Pairing, PlatformChatId, PlatformMessageId};
use crate::openchat::Author;
use anyhow::Result;
use async_trait::async_trait;
use oc_bots_sdk::types::{BridgePlatform, BridgedUser, BridgedUserId};

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

    /// Sends the account a direct message, eg. to tell its owner of a tip which OpenChat holds for
    /// them. The text is plain, so the platform escapes it as it needs.
    async fn send_direct_message(&self, account: BridgedUserId, text: &str) -> Result<()>;

    /// How to bridge an OpenChat chat with one on the platform, shown when /bridge is run in
    /// OpenChat without a code: how to add the bot there, and how to get a code from it
    fn bridge_instructions(&self) -> String;

    /// How a code to bridge a chat is got on the platform, which the bot's description follows with
    /// ", then run /bridge with the code here."
    fn how_to_get_a_code() -> String {
        format!(
            "In {}, run /bridge in the chat to bridge to get a code",
            Self::NAME
        )
    }

    /// What OpenChat's /bridge says to do once a code is unknown or has expired
    fn how_to_get_a_new_code() -> String {
        format!("Run /bridge in {} to get a new one.", Self::NAME)
    }

    /// Fills in what's only worth looking up for a message which will be relayed, eg. the author's
    /// avatar
    async fn complete_author(&self, _author: &mut BridgedUser) {}

    /// Once the chat is paired, eg. to say so in it
    async fn paired(&self, _pairing: &Pairing) -> Result<()> {
        Ok(())
    }

    /// Once a pairing is removed, eg. to remove a webhook created for it
    async fn unpaired(&self, _pairing: &Pairing) -> Result<()> {
        Ok(())
    }
}

/// A failure on the platform which retrying won't fix, eg. Discord refusing a message. OpenChat
/// isn't asked to retry the notification, as its retries would hold up every other chat's.
#[derive(Debug)]
pub enum PermanentFailure {
    /// The chat, or what the bridge posts into it with, is gone, so the pairing is removed
    ChatGone,
    Rejected(String),
}

impl std::fmt::Display for PermanentFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PermanentFailure::ChatGone => write!(f, "The chat is gone"),
            PermanentFailure::Rejected(reason) => write!(f, "Rejected: {reason}"),
        }
    }
}

impl std::error::Error for PermanentFailure {}

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
        BridgePlatform::Twitch => "Twitch",
    }
}
