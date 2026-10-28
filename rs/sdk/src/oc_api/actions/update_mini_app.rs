use crate::oc_api::actions::ActionDef;
use crate::types::{BotChatContext, MessageId, MessageIndex, MiniAppUpdate, UnitResult};
use serde::{Deserialize, Serialize};

/// A bot changes what its MiniApp card shows as its game goes on, in a group or channel: its
/// status, players, whose move it is and the result. Only the bot which posted the card can, needing
/// no permission beyond being installed there, with a command's context or autonomously. The
/// players must be members of the chat, or the bot itself, and a finished card can't change.
pub struct UpdateMiniAppAction;

impl ActionDef for UpdateMiniAppAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_update_mini_app"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    pub thread: Option<MessageIndex>,
    pub message_id: MessageId,
    pub update: MiniAppUpdate,
}

pub type Response = UnitResult;
