use create_channel::CreateChannelBuilder;
use delete_channel::DeleteChannelBuilder;
use send_message::SendMessageBuilder;

use crate::types::{ActionContext, ChannelId, MessageContent, TextContent};
use crate::Runtime;
use std::sync::Arc;

mod create_channel;
mod delete_channel;
mod send_message;

pub struct Client<R> {
    runtime: Arc<R>,
    context: ActionContext,
}

impl<R: Runtime> Client<R> {
    pub fn new(runtime: Arc<R>, context: ActionContext) -> Self {
        Client { runtime, context }
    }

    pub fn send_message(self, content: MessageContent) -> SendMessageBuilder<R> {
        SendMessageBuilder::new(self, content)
    }

    pub fn send_text_message(self, text: String) -> SendMessageBuilder<R> {
        self.send_message(MessageContent::Text(TextContent { text }))
    }

    pub fn create_channel(self, name: String, is_public: bool) -> CreateChannelBuilder<R> {
        CreateChannelBuilder::new(self, name, is_public)
    }

    pub fn delete_channel(self, channel_id: ChannelId) -> DeleteChannelBuilder<R> {
        DeleteChannelBuilder::new(self, channel_id)
    }
}
