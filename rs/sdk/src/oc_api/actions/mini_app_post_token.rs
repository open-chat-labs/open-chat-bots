use crate::oc_api::actions::ActionDef;
use crate::types::{BotChatContext, ChannelId, MessageId, MessageIndex, OCError};
use serde::{Deserialize, Serialize};

/// A token which lets OpenChat's MiniApp service post one MiniApp card for the bot, from a
/// LocalUserIndex, called as the bot, in the context the bot would send a message with. The
/// LocalUserIndex resolves the card's chat, thread and message id as `bot_send_message` would, and
/// fixes them in the token, so posting it twice posts one card. It's valid for an hour.
pub struct MiniAppPostTokenAction;

impl ActionDef for MiniAppPostTokenAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_mini_app_post_token"
    }

    fn is_query() -> bool {
        true
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    /// The channel, for a command in a community
    pub channel_id: Option<ChannelId>,
    pub thread: Option<MessageIndex>,
    /// A command's message id, or one the bot chose for a card it posts autonomously. Left out, the
    /// LocalUserIndex picks one.
    pub message_id: Option<MessageId>,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(String),
    Error(OCError),
}
