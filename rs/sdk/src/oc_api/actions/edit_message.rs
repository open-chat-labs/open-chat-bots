use crate::oc_api::actions::ActionDef;
use crate::types::{
    BotChatContext, MessageContentInitial, MessageId, MessageIndex, OgPreview, UnitResult,
};
use serde::{Deserialize, Serialize};

/// A bot edits its own messages autonomously, in a group or channel, eg. a bridge bot relaying the
/// edits made on the other platform. The new content must be the same type as the old, and a poll
/// can't be edited.
pub struct EditMessageAction;

impl ActionDef for EditMessageAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_edit_message"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    pub thread: Option<MessageIndex>,
    pub message_id: MessageId,
    pub content: MessageContentInitial,
    pub block_level_markdown: bool,
    pub og_previews: Option<Vec<OgPreview>>,
}

pub type Response = UnitResult;
