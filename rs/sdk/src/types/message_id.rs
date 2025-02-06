use serde::{Deserialize, Deserializer, Serializer};
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

pub fn serialize_message_id<S>(message_id: &MessageId, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    if serializer.is_human_readable() {
        serializer.serialize_str(&message_id.to_string())
    } else {
        serializer.serialize_u64(*message_id)
    }
}
