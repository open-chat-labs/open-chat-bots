use crate::openchat_client::command::send_message::SendMessageBuilder;
use crate::types::{BotCommandContext, MessageContent, TextContent};
use crate::Runtime;
use std::sync::Arc;

mod send_message;

pub struct OpenChatClientForCommand<R> {
    runtime: Arc<R>,
    context: BotCommandContext,
}

impl<R: Runtime + Send + Sync + 'static> OpenChatClientForCommand<R> {
    pub fn new(runtime: Arc<R>, context: BotCommandContext) -> Self {
        OpenChatClientForCommand { runtime, context }
    }

    pub fn send_text_message(self, text: String) -> SendMessageBuilder<R> {
        self.send_message(MessageContent::Text(TextContent { text }))
    }

    pub fn send_message(self, content: MessageContent) -> SendMessageBuilder<R> {
        SendMessageBuilder::new(self, content)
    }
}
