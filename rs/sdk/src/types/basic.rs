use candid::{CandidType, Principal};
use serde::{Deserialize, Serialize};
use std::fmt::{Debug, Display, Formatter};

pub type CanisterId = Principal;
pub type TimestampMillis = u64;
pub type TimestampNanos = u64;
pub type Milliseconds = u64;
pub type Nanoseconds = u64;
pub type MessageId = String; // u64 encoded as string
pub type Hash = [u8; 32];

#[derive(CandidType, Serialize, Deserialize, Copy, Clone, Debug)]
pub struct MessageIndex(u32);

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

#[derive(Serialize, Deserialize, Debug)]
pub enum StringChat {
    Direct(String),
    Group(String),
    Channel(String, String),
}
