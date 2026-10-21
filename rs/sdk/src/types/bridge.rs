use serde::{Deserialize, Serialize};

/// An account on another platform, eg. Discord, whose messages a bridge bot relays into OpenChat.
/// A relayed message holds only this, in its `BotMessageContext`. The account's profile, and the
/// OpenChat user who has linked it, if any, are in the UserIndex's registry.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum BridgedUserId {
    /// The user's Discord snowflake id
    Discord(u64),
    /// The sender's Telegram id. Negative if a chat sent the message, eg. a channel or a group's
    /// anonymous admins.
    Telegram(i64),
}

/// The platforms bridged into OpenChat, each by its own bridge bot
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum BridgePlatform {
    Discord,
    Telegram,
}

impl BridgedUserId {
    pub fn platform(&self) -> BridgePlatform {
        match self {
            BridgedUserId::Discord(_) => BridgePlatform::Discord,
            BridgedUserId::Telegram(_) => BridgePlatform::Telegram,
        }
    }
}
