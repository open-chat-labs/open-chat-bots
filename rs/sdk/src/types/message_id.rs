use crate::utils::serialize_large_uint;
use candid::CandidType;
use serde::{Deserialize, Serialize};
use std::fmt::{Debug, Display, Formatter};
use std::ops::Deref;
use std::str::FromStr;

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Hash)]
#[serde(from = "MessageIdIntOrString")]
pub struct MessageId(#[serde(serialize_with = "serialize_large_uint")] u64);

#[derive(Deserialize)]
#[serde(untagged)]
enum MessageIdIntOrString {
    Int(u64),
    String(String),
}

impl Deref for MessageId {
    type Target = u64;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl From<u64> for MessageId {
    fn from(value: u64) -> Self {
        MessageId(value)
    }
}

impl From<MessageId> for u64 {
    fn from(value: MessageId) -> Self {
        value.0
    }
}

impl From<MessageIdIntOrString> for MessageId {
    fn from(value: MessageIdIntOrString) -> Self {
        match value {
            MessageIdIntOrString::Int(i) => i.into(),
            MessageIdIntOrString::String(s) => u64::from_str(&s).unwrap().into(),
        }
    }
}

impl Debug for MessageId {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        std::fmt::Debug::fmt(&self.0, f)
    }
}

impl Display for MessageId {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}
