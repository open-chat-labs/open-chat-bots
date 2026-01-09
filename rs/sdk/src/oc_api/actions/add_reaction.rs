use crate::oc_api::actions::ActionDef;
use crate::types::{BotChatContext, MessageId, MessageIndex, Reaction, UnitResult};
use serde::{Deserialize, Serialize};

pub struct AddReactionAction;

impl ActionDef for AddReactionAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_add_reaction"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    pub thread: Option<MessageIndex>,
    pub message_id: MessageId,
    pub reaction: Reaction,
}

pub type Response = UnitResult;
