use candid::{CandidType, Principal};
use serde::{Deserialize, Serialize};
use std::fmt::{Debug, Display, Formatter};

use super::{BotCommandScope, OCError};

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CanisterId(Principal);

pub type CommunityId = CanisterId;
pub type ChatId = CanisterId;
pub type UserId = CanisterId;
pub type ChannelId = u32;
pub type EventIndex = u32;
pub type Hash = [u8; 32];
pub type MessageIndex = u32;
pub type Milliseconds = u64;
pub type Nanoseconds = u64;
pub type TimestampMillis = u64;
pub type TimestampNanos = u64;

pub type CallResult<T> = Result<T, CallError>;
pub type CallError = (i32, String);

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum UnitResult {
    Success,
    Error(OCError),
}

impl Display for CanisterId {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

impl Debug for CanisterId {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

impl From<Principal> for CanisterId {
    fn from(principal: Principal) -> Self {
        CanisterId(principal)
    }
}

impl From<CanisterId> for Principal {
    fn from(canister_id: CanisterId) -> Self {
        canister_id.0
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, Hash, PartialEq, Eq)]
pub enum Chat {
    Direct(ChatId),
    Group(ChatId),
    Channel(CommunityId, ChannelId),
}

impl Chat {
    pub fn community_id(&self) -> Option<CommunityId> {
        match self {
            Chat::Channel(community_id, _) => Some(*community_id),
            _ => None,
        }
    }

    pub fn channel_id(&self) -> Option<ChannelId> {
        match self {
            Chat::Channel(_, channel_id) => Some(*channel_id),
            _ => None,
        }
    }

    pub fn canister_id(&self) -> CanisterId {
        match self {
            Chat::Direct(canister_id) => *canister_id,
            Chat::Group(canister_id) => *canister_id,
            Chat::Channel(canister_id, _) => *canister_id,
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Default)]
pub struct Rules {
    pub text: String,
    pub enabled: bool,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Document {
    pub id: u128,
    pub mime_type: String,
    pub data: Vec<u8>,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub enum ActionScope {
    Chat(Chat),
    Community(CommunityId),
}

impl ActionScope {
    pub fn community_id(&self) -> Option<CommunityId> {
        match self {
            ActionScope::Chat(_) => None,
            ActionScope::Community(community_id) => Some(*community_id),
        }
    }

    pub fn from_location(location: &InstallationLocation, channel_id: Option<ChannelId>) -> Self {
        match location {
            InstallationLocation::Community(community_id) => {
                if let Some(channel_id) = channel_id {
                    ActionScope::Chat(Chat::Channel(*community_id, channel_id))
                } else {
                    ActionScope::Community(*community_id)
                }
            }
            InstallationLocation::Group(chat_id) => ActionScope::Chat(Chat::Group(*chat_id)),
            InstallationLocation::User(user_id) => ActionScope::Chat(Chat::Direct(*user_id)),
        }
    }

    pub fn with_channel_id(self, channel_id: ChannelId) -> Self {
        match self {
            ActionScope::Community(community_id) => {
                ActionScope::Chat(Chat::Channel(community_id, channel_id))
            }
            _ => self,
        }
    }
}

#[derive(
    CandidType, Serialize, Deserialize, Clone, Debug, Ord, PartialOrd, Eq, PartialEq, Hash,
)]
pub struct Reaction(String);

#[derive(CandidType, Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum InstallationLocation {
    Community(CommunityId),
    Group(ChatId),
    User(ChatId),
}

impl From<Chat> for InstallationLocation {
    fn from(value: Chat) -> Self {
        match value {
            Chat::Channel(community_id, _) => InstallationLocation::Community(community_id),
            Chat::Group(g) => InstallationLocation::Group(g),
            Chat::Direct(u) => InstallationLocation::User(u),
        }
    }
}

impl From<BotCommandScope> for InstallationLocation {
    fn from(value: BotCommandScope) -> Self {
        match value {
            BotCommandScope::Chat(details) => details.chat.into(),
            BotCommandScope::Community(details) => {
                InstallationLocation::Community(details.community_id)
            }
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum InstallationLocationType {
    Community,
    Group,
    User,
}

impl From<InstallationLocation> for InstallationLocationType {
    fn from(value: InstallationLocation) -> Self {
        match value {
            InstallationLocation::Community(_) => InstallationLocationType::Community,
            InstallationLocation::Group(_) => InstallationLocationType::Group,
            InstallationLocation::User(_) => InstallationLocationType::User,
        }
    }
}
