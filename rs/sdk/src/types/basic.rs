use candid::{CandidType, Principal};
use serde::{Deserialize, Serialize};
use std::fmt::{Debug, Display, Formatter};

use super::{BotCommandScope, OCError};

pub type CanisterId = Principal;
pub type CommunityId = Principal;
pub type ChatId = Principal;
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

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Eq, PartialEq)]
pub struct UserId(CanisterId);

impl Display for UserId {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

impl Debug for UserId {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

impl From<Principal> for UserId {
    fn from(principal: Principal) -> Self {
        UserId(principal)
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, Hash, PartialEq, Eq)]
pub enum Chat {
    Direct(ChatId),
    Group(ChatId),
    Channel(CommunityId, ChannelId),
}

impl Chat {
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
pub enum AutonomousScope {
    Chat(Chat),
    Community(CommunityId),
}

impl AutonomousScope {
    pub fn community_id(&self) -> Option<CommunityId> {
        match self {
            AutonomousScope::Chat(_) => None,
            AutonomousScope::Community(community_id) => Some(*community_id),
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

impl InstallationLocation {
    pub fn canister_id(&self) -> CanisterId {
        match self {
            InstallationLocation::Community(c) => *c,
            InstallationLocation::Group(g) => *g,
            InstallationLocation::User(u) => *u,
        }
    }
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
