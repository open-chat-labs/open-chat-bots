use super::{TimestampMillis, UserId};
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

/// The profile of an account on another platform. A bridge bot sends its author's with each message
/// it relays, and OpenChat's UserIndex keeps the latest, which `bridged_users` returns.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum BridgedUser {
    Discord(DiscordUser),
    Telegram(TelegramUser),
}

impl BridgedUser {
    pub fn id(&self) -> BridgedUserId {
        match self {
            BridgedUser::Discord(u) => BridgedUserId::Discord(u.id),
            BridgedUser::Telegram(u) => BridgedUserId::Telegram(u.id),
        }
    }

    pub fn platform(&self) -> BridgePlatform {
        self.id().platform()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct DiscordUser {
    /// The user's Discord snowflake id
    pub id: u64,
    /// The user's Discord username, or the webhook's name if a webhook posted the message. At most
    /// 80 characters.
    pub username: String,
    /// The user's global display name, not their nickname in a server, since the profile is shown
    /// wherever they're bridged. At most 80 characters.
    pub display_name: Option<String>,
    /// The hash of the user's global avatar, from which Discord's CDN url is built. 32 hex
    /// characters, after "a_" if it's animated.
    pub avatar: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct TelegramUser {
    /// The sender's Telegram id. Negative if a chat sent the message, eg. a channel or a group's
    /// anonymous admins.
    pub id: i64,
    /// At most 32 characters
    pub username: Option<String>,
    /// The user's first and last names, or the title of the chat which sent the message. At most
    /// 129 characters.
    pub display_name: String,
    /// Telegram's `file_unique_id` for the user's profile photo, which the Telegram bridge copies to
    /// its own CDN, since the urls of Telegram's copies contain the bot's token. OpenChat builds the
    /// photo's url from it and the user's id. Up to 64 characters: letters, digits, `_` and `-`.
    pub photo_id: Option<String>,
}

/// A bridged account's latest profile, from OpenChat's UserIndex
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct BridgedUserSummary {
    pub user: BridgedUser,
    /// The OpenChat user who has linked the account to themself, if any. OpenChat shows the
    /// account's messages as theirs.
    pub linked_user_id: Option<UserId>,
    /// When the profile or the link last changed
    pub updated: TimestampMillis,
}
