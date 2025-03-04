use crate::oc_api::actions::ActionDef;
use crate::types::{
    AuthToken, ChannelId, EventIndex, MessageContentInitial, MessageId, MessageIndex,
    TimestampMillis,
};
use candid::{CandidType, Deserialize};
use serde::Serialize;

pub struct SendMessageAction;

impl ActionDef for SendMessageAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_send_message"
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub channel_id: Option<ChannelId>,
    pub message_id: Option<MessageId>,
    pub content: MessageContentInitial,
    pub block_level_markdown: bool,
    pub finalised: bool,
    pub auth_token: AuthToken,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum Response {
    Success(SuccessResult),
    FailedAuthentication(String),
    InvalidRequest(String),
    NotAuthorized,
    Frozen,
    ThreadNotFound,
    MessageAlreadyFinalised,
    C2CError(i32, String),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct SuccessResult {
    pub message_id: MessageId,
    pub event_index: EventIndex,
    pub message_index: MessageIndex,
    pub timestamp: TimestampMillis,
    pub expires_at: Option<TimestampMillis>,
}
