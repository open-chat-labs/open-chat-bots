use crate::oc_api::client_factory::command::send_message::SendMessageBuilder;
use crate::types::{BotCommandContext, MessageContent, TextContent};
use crate::Runtime;
use std::sync::Arc;

mod send_message;

pub struct ClientForCommand<R, S> {
    runtime: Arc<R>,
    context: BotCommandContext<S>,
}

impl<R: Runtime, S> ClientForCommand<R, S> {
    pub fn new(runtime: Arc<R>, context: BotCommandContext<S>) -> Self {
        ClientForCommand { runtime, context }
    }

    pub fn send_text_message(self, text: String) -> SendMessageBuilder<R, S> {
        self.send_message(MessageContent::Text(TextContent { text }))
    }

    pub fn send_message(self, content: MessageContent) -> SendMessageBuilder<R, S> {
        SendMessageBuilder::new(self, content)
    }
}
