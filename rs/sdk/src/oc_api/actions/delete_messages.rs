use crate::oc_api::actions::ActionDef;
use crate::types::{BotChatContext, MessageId, MessageIndex, UnitResult};
use candid::CandidType;
use serde::{Deserialize, Serialize};

pub struct DeleteMessagesAction;

impl ActionDef for DeleteMessagesAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_delete_messages_v2"
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    pub thread: Option<MessageIndex>,
    pub message_ids: Vec<MessageId>,
}

pub type Response = UnitResult;
