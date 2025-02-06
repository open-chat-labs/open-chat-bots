use crate::openchat_client::api_key::send_message::SendMessageBuilder;
use crate::types::{BotApiKeyContext, MessageContent};
use crate::Runtime;
use std::sync::Arc;

mod send_message;

pub struct OpenChatClientForApiKey<R> {
    runtime: Arc<R>,
    context: BotApiKeyContext,
}

impl<R: Runtime + Send + Sync + 'static> OpenChatClientForApiKey<R> {
    pub fn new(runtime: Arc<R>, context: BotApiKeyContext) -> Self {
        OpenChatClientForApiKey { runtime, context }
    }

    pub fn send_message(self, content: MessageContent) -> SendMessageBuilder<R> {
        SendMessageBuilder::new(self, content)
    }
}
