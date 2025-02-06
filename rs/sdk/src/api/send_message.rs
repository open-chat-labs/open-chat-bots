use crate::types::{
    AuthToken, ChannelId, EventIndex, MessageContent, MessageId, MessageIndex, TimestampMillis,
};
use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct SendMessageArgs {
    pub channel_id: Option<ChannelId>,
    pub message_id: Option<MessageId>,
    pub content: MessageContent,
    pub block_level_markdown: bool,
    pub finalised: bool,
    pub auth_token: AuthToken,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum SendMessageResponse {
    Success(SendMessageSuccessResult),
    InvalidRequest(String),
    NotAuthorized,
    Frozen,
    ThreadNotFound,
    MessageAlreadyFinalised,
    C2CError(i32, String),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct SendMessageSuccessResult {
    pub message_id: MessageId,
    pub event_index: EventIndex,
    pub message_index: MessageIndex,
    pub timestamp: TimestampMillis,
    pub expires_at: Option<TimestampMillis>,
}
