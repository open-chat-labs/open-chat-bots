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

#[derive(CandidType, Serialize, Deserialize, Clone, Copy)]
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

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum AuthToken {
    Jwt(String),
    ApiKey(String),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum Chat {
    Direct(CanisterId),
    Group(CanisterId),
    Channel(CanisterId, ChannelId),
}
