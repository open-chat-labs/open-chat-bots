use crate::api::command::Message;
use crate::oc_api::actions::send_message::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::client_factory::command::ClientForCommand;
use crate::types::{CallResult, CanisterId, MessageContent};
use crate::Runtime;
use std::sync::Arc;

pub struct SendMessageBuilder<R> {
    client: ClientForCommand<R>,
    content: MessageContent,
    block_level_markdown: bool,
    finalised: bool,
}

impl<R: Runtime> SendMessageBuilder<R> {
    pub fn new(client: ClientForCommand<R>, content: MessageContent) -> Self {
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
        F: FnOnce(Args, CallResult<Response>) + Send + Sync + 'static,
    >(
        self,
        on_response: F,
    ) -> Message {
        let message = Message {
            id: self.client.context.scope.message_id().unwrap(),
            content: self.content.clone(),
            finalised: self.finalised,
            block_level_markdown: self.block_level_markdown,
            ephemeral: false,
        };
        self.execute(on_response);
        message
    }
}

impl<R: Runtime> ActionArgsBuilder<R> for SendMessageBuilder<R> {
    type Action = SendMessageAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn bot_api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway
    }

    fn into_args(self) -> Args {
        Args {
            content: self.content,
            channel_id: None,
            message_id: None,
            block_level_markdown: self.block_level_markdown,
            finalised: self.finalised,
            auth_token: self.client.context.token,
        }
    }
}
