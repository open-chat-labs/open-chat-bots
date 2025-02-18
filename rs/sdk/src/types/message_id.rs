use candid::CandidType;
use serde::{Deserialize, Serialize, Serializer};
use std::fmt::{Debug, Display, Formatter};
use std::ops::Deref;
use std::str::FromStr;

#[derive(CandidType, Deserialize, Clone, Copy, Hash)]
#[serde(from = "MessageIdIntOrString")]
pub struct MessageId(u64);

#[derive(Deserialize)]
#[serde(untagged)]
enum MessageIdIntOrString {
    Int(u64),
    String(String),
}

impl Serialize for MessageId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        if self.0 > u32::MAX as u64 && serializer.is_human_readable() {
            serializer.serialize_str(&self.0.to_string())
        } else {
            serializer.serialize_u64(self.0)
        }
    }
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
