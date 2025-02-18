use create_channel::CreateChannelBuilder;
use delete_channel::DeleteChannelBuilder;

use crate::openchat_client_factory::api_key::send_message::SendMessageBuilder;
use crate::types::{BotApiKeyContext, ChannelId, MessageContent};
use crate::Runtime;
use std::sync::Arc;

mod create_channel;
mod delete_channel;
mod send_message;

pub struct OpenChatClientForApiKey<R> {
    runtime: Arc<R>,
    context: BotApiKeyContext,
}

impl<R: Runtime> OpenChatClientForApiKey<R> {
    pub fn new(runtime: Arc<R>, context: BotApiKeyContext) -> Self {
        OpenChatClientForApiKey { runtime, context }
    }

    pub fn send_message(self, content: MessageContent) -> SendMessageBuilder<R> {
        SendMessageBuilder::new(self, content)
    }

    pub fn create_channel(self, name: String, is_public: bool) -> CreateChannelBuilder<R> {
        CreateChannelBuilder::new(self, name, is_public)
    }

    pub fn delete_channel(self, channel_id: ChannelId) -> DeleteChannelBuilder<R> {
        DeleteChannelBuilder::new(self, channel_id)
    }
}
