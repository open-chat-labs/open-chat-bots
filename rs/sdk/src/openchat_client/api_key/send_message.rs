use crate::api::{SendMessageArgs, SendMessageResponse};
use crate::openchat_client::api_key::OpenChatClientForApiKey;
use crate::types::{AuthToken, CallResult, ChannelId, MessageContent, MessageId};
use crate::Runtime;

pub struct SendMessageBuilder<R> {
    client: OpenChatClientForApiKey<R>,
    content: MessageContent,
    channel_id: Option<ChannelId>,
    message_id: Option<MessageId>,
    block_level_markdown: bool,
    finalised: bool,
}

impl<R: Runtime + Send + Sync + 'static> SendMessageBuilder<R> {
    pub fn new(client: OpenChatClientForApiKey<R>, content: MessageContent) -> Self {
        Self {
            client,
            content,
            channel_id: None,
            message_id: None,
            block_level_markdown: false,
            finalised: true,
        }
    }

    pub fn with_channel_id(mut self, channel_id: ChannelId) -> Self {
        self.channel_id = Some(channel_id);
        self
    }

    pub fn with_message_id(mut self, message_id: MessageId) -> Self {
        self.message_id = Some(message_id);
        self
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
    ) {
        let runtime = self.client.runtime.clone();
        let runtime_clone = self.client.runtime.clone();
        let bot_api_gateway = self.client.context.bot_api_gateway();
        let args = self.into_args();

        runtime.spawn(async move {
            let response = runtime_clone
                .send_message(bot_api_gateway, args.clone())
                .await;

            on_response(args, response);
        });
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
            channel_id: self.channel_id,
            message_id: self.message_id,
            block_level_markdown: self.block_level_markdown,
            finalised: self.finalised,
            auth_token: AuthToken::Jwt(self.client.context.into_jwt()),
        }
    }
}
