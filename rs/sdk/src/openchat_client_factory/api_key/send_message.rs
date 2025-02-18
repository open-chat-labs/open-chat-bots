use crate::api::send_message;
use crate::openchat_client_factory::api_key::OpenChatClientForApiKey;
use crate::types::{CallResult, ChannelId, MessageContent, MessageId};
use crate::Runtime;

pub struct SendMessageBuilder<R> {
    client: OpenChatClientForApiKey<R>,
    content: MessageContent,
    channel_id: Option<ChannelId>,
    message_id: Option<MessageId>,
    block_level_markdown: bool,
    finalised: bool,
}

impl<R: Runtime> SendMessageBuilder<R> {
    pub fn new(client: OpenChatClientForApiKey<R>, content: MessageContent) -> Self {
        let channel_id = client.context.channel_id();
        Self {
            client,
            content,
            channel_id,
            message_id: None,
            block_level_markdown: false,
            finalised: true,
        }
    }

    // This only takes effect for community scope
    pub fn with_channel_id(mut self, channel_id: ChannelId) -> Self {
        if self.channel_id.is_none() {
            self.channel_id = Some(channel_id);
        }
        self
    }

    // If this is not set then OpenChat will generate a new message id
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
        F: FnOnce(send_message::Args, CallResult<send_message::Response>) + Send + Sync + 'static,
    >(
        self,
        on_response: F,
    ) {
        let runtime = self.client.runtime.clone();
        let runtime_clone = self.client.runtime.clone();
        let bot_api_gateway = self.client.context.api_gateway;
        let args = self.into_args();

        runtime.spawn(async move {
            let response = runtime_clone
                .send_message(bot_api_gateway, args.clone())
                .await
                .map(|(r,)| r);

            on_response(args, response);
        });
    }

    pub async fn execute_async(self) -> CallResult<send_message::Response> {
        let runtime = self.client.runtime.clone();
        let bot_api_gateway = self.client.context.api_gateway;
        let args = self.into_args();

        runtime
            .send_message(bot_api_gateway, args)
            .await
            .map(|(r,)| r)
    }

    fn into_args(self) -> send_message::Args {
        send_message::Args {
            content: self.content,
            channel_id: self.channel_id,
            message_id: self.message_id,
            block_level_markdown: self.block_level_markdown,
            finalised: self.finalised,
            auth_token: self.client.context.token,
        }
    }
}
