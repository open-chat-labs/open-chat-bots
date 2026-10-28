use crate::oc_api::actions::ActionDef;
use crate::types::{BotChatContext, MessageId, MessageIndex, MiniAppUpdate, UnitResult};
use serde::{Deserialize, Serialize};

/// A bot changes what its MiniApp card shows as its game goes on, in a group or channel: its
/// status, players, whose move it is and the result. Only the bot which posted the card can, as for
/// deleting its own messages: with a command's context if it's installed, and autonomously if it's
/// installed to act autonomously (an `autonomous_config`, which the owner granted). The players
/// must be members of the chat, or the bot itself, and a finished card can't change.
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
