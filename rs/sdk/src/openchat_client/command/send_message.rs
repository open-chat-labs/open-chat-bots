use crate::api::{Message, SendMessageArgs, SendMessageResponse};
use crate::openchat_client::command::OpenChatClientForCommand;
use crate::types::{AuthToken, CallResult, MessageContent};
use crate::Runtime;

pub struct SendMessageBuilder<R> {
    client: OpenChatClientForCommand<R>,
    content: MessageContent,
    block_level_markdown: bool,
    finalised: bool,
}

impl<R: Runtime + Send + Sync + 'static> SendMessageBuilder<R> {
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

    pub fn execute<
        F: FnOnce(SendMessageArgs, CallResult<(SendMessageResponse,)>) + Send + Sync + 'static,
    >(
        self,
        on_response: F,
    ) -> Message {
        let runtime = self.client.runtime.clone();
        let runtime_clone = self.client.runtime.clone();
        let bot_api_gateway = self.client.context.bot_api_gateway();
        let message_id = self.client.context.chat_scope().unwrap().message_id;

        let args = self.into_args();

        let message = Message {
            id: message_id,
            content: args.content.clone(),
            finalised: args.finalised,
        };

        runtime.spawn(async move {
            let response = runtime_clone
                .send_message(bot_api_gateway, args.clone())
                .await;

            on_response(args, response);
        });

        message
    }

    pub async fn execute_async(self) -> CallResult<(SendMessageResponse,)> {
        let runtime = self.client.runtime.clone();
        let bot_api_gateway = self.client.context.bot_api_gateway();
        let args = self.into_args();

        runtime.send_message(bot_api_gateway, args).await
    }

    fn into_args(self) -> SendMessageArgs {
        SendMessageArgs {
            content: self.content,
            channel_id: None,
            message_id: None,
            block_level_markdown: self.block_level_markdown,
            finalised: self.finalised,
            auth_token: AuthToken::Jwt(self.client.context.into_jwt()),
        }
    }
}
