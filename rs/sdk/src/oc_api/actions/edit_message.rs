use crate::oc_api::actions::ActionDef;
use crate::types::{
    BotChatContext, MessageContentInitial, MessageId, MessageIndex, OgPreview, UnitResult,
};
use serde::{Deserialize, Serialize};

/// For now only bridge bots can edit their messages, to relay the edits made on the other platform.
/// The new content must be the same type as the old, and a poll can't be edited.
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
