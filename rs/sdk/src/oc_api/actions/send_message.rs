use crate::oc_api::actions::ActionDef;
use crate::types::{
    BotChatContext, EventIndex, MessageContentInitial, MessageId, MessageIndex, OCError,
    TimestampMillis,
};
use serde::{Deserialize, Serialize};

pub struct SendMessageAction;

impl ActionDef for SendMessageAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_send_message"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    pub thread: Option<MessageIndex>,
    pub message_id: Option<MessageId>,
    pub replies_to: Option<EventIndex>,
    pub content: MessageContentInitial,
    pub block_level_markdown: bool,
    pub finalised: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(SuccessResult),
    Error(OCError),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SuccessResult {
    pub message_id: MessageId,
    pub event_index: EventIndex,
    pub message_index: MessageIndex,
    pub timestamp: TimestampMillis,
    pub expires_at: Option<TimestampMillis>,
}
