use crate::actions::ActionArgsBuilder;
use crate::api::{send_message, Message};
use crate::openchat_client_factory::command::OpenChatClientForCommand;
use crate::types::{CallResult, CanisterId, MessageContent};
use crate::Runtime;
use std::sync::Arc;

pub struct SendMessageBuilder<R> {
    client: OpenChatClientForCommand<R>,
    content: MessageContent,
    block_level_markdown: bool,
    finalised: bool,
}

impl<R: Runtime> SendMessageBuilder<R> {
    pub fn new(client: OpenChatClientForCommand<R>, content: MessageContent) -> Self {
        Self {
            client,
            content,
            block_level_markdown: false,
            finalised: true,
        }
    }

    pub fn with_block_level_markdown(mut self, block_level_markdown: bool) -> Self {
        self.block_level_markdown = block_level_markdown;
        self
    }

    pub fn with_finalised(mut self, finalised: bool) -> Self {
        self.finalised = finalised;
        self
    }

    pub fn execute_then_return_message<
        F: FnOnce(send_message::Args, CallResult<send_message::Response>) + Send + Sync + 'static,
    >(
        self,
        on_response: F,
    ) -> Message {
        let message = Message {
            id: self.client.context.scope.message_id().unwrap(),
            content: self.content.clone(),
            finalised: self.finalised,
            block_level_markdown: self.block_level_markdown,
        };
        self.execute(on_response);
        message
    }
}

impl<R: Runtime> ActionArgsBuilder<R> for SendMessageBuilder<R> {
    type ActionArgs = send_message::Args;
    type ActionResponse = send_message::Response;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn bot_api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway
    }

    fn method_name(&self) -> &str {
        "bot_send_message"
    }

    fn into_args(self) -> send_message::Args {
        send_message::Args {
            content: self.content,
            channel_id: None,
            message_id: None,
            block_level_markdown: self.block_level_markdown,
            finalised: self.finalised,
            auth_token: self.client.context.token,
        }
    }
}
