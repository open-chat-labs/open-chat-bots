use crate::oc_api::actions::send_message::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::client_factory::api_key::ClientForApiKey;
use crate::types::{CanisterId, ChannelId, MessageContent, MessageId};
use crate::Runtime;
use std::sync::Arc;

pub struct SendMessageBuilder<R> {
    client: ClientForApiKey<R>,
    content: MessageContent,
    channel_id: Option<ChannelId>,
    message_id: Option<MessageId>,
    block_level_markdown: bool,
    finalised: bool,
}

impl<R: Runtime> SendMessageBuilder<R> {
    pub fn new(client: ClientForApiKey<R>, content: MessageContent) -> Self {
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
            channel_id: self.channel_id,
            message_id: self.message_id,
            block_level_markdown: self.block_level_markdown,
            finalised: self.finalised,
            auth_token: self.client.context.token,
        }
    }
}
