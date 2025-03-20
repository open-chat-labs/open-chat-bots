use candid::{CandidType, Principal};
use serde::{Deserialize, Serialize};
use std::fmt::{Debug, Display, Formatter};

pub type CanisterId = Principal;
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

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum AuthToken {
    Jwt(String),
    ApiKey(String),
}

impl AuthToken {
    pub fn into(self) -> String {
        match self {
            AuthToken::Jwt(jwt) => jwt,
            AuthToken::ApiKey(api_key) => api_key,
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, Hash, PartialEq, Eq)]
pub enum Chat {
    Direct(CanisterId),
    Group(CanisterId),
    Channel(CanisterId, ChannelId),
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
pub enum ActionScope {
    Chat(Chat),
    Community(CanisterId),
}
