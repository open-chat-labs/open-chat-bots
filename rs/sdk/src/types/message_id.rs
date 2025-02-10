use serde::{Deserialize, Deserializer};
use std::str::FromStr;

pub type MessageId = u64;

pub fn deserialize_message_id<'de, D: Deserializer<'de>>(d: D) -> Result<MessageId, D::Error> {
    MessageIdIntOrString::deserialize(d).map(|v| v.into())
}

#[derive(Deserialize)]
#[serde(untagged)]
enum MessageIdIntOrString {
    Int(u64),
    String(String),
}

impl From<MessageIdIntOrString> for MessageId {
    fn from(value: MessageIdIntOrString) -> Self {
        match value {
            MessageIdIntOrString::Int(i) => i,
            MessageIdIntOrString::String(s) => u64::from_str(&s).unwrap(),
        }
    }
}
