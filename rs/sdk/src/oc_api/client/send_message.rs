use crate::api::command::Message;
use crate::oc_api::actions::send_message::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::BotChatContext;
use crate::types::EventIndex;
use crate::types::MessageIndex;
use crate::types::{ActionContext, CallResult};
use crate::types::{CanisterId, ChannelId, MessageContentInitial, MessageId};
use std::sync::Arc;

use super::Client;

pub struct SendMessageBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    content: MessageContentInitial,
    channel_id: Option<ChannelId>,
    thread: Option<MessageIndex>,
    message_id: Option<MessageId>,
    replies_to: Option<EventIndex>,
    block_level_markdown: bool,
    finalised: bool,
}

impl<'c, R: Runtime, C: ActionContext> SendMessageBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, content: MessageContentInitial) -> Self {
        let message_id = client.context.message_id();

        Self {
            client,
            content,
            channel_id: None,
            thread: None,
            message_id,
            replies_to: None,
            block_level_markdown: false,
            finalised: true,
        }
    }

    // This only takes effect for community scope
    pub fn with_channel_id(mut self, channel_id: Option<ChannelId>) -> Self {
        self.channel_id = channel_id;
        self
    }

    pub fn with_thread(mut self, thread: Option<MessageIndex>) -> Self {
        self.thread = thread;
        self
    }

    pub fn replies_to(mut self, replies_to: Option<EventIndex>) -> Self {
        self.replies_to = replies_to;
        self
    }

    // This is only needed when using an API Key
    // If this is not set then OpenChat will generate a new message id
    pub fn with_message_id(mut self, message_id: MessageId) -> Self {
        if self.message_id.is_none() {
            self.message_id = Some(message_id);
        }
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

    pub fn execute_then_return_message<
        F: FnOnce(Args, CallResult<Response>) + Send + Sync + 'static,
    >(
        self,
        on_response: F,
    ) -> Option<Message> {
        let message = self.client.context.message_id().map(|message_id| Message {
            id: message_id,
            content: self.content.clone(),
            finalised: self.finalised,
            block_level_markdown: self.block_level_markdown,
            ephemeral: false,
        });

        self.execute(on_response);
        message
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for SendMessageBuilder<'_, R, C> {
    type Action = SendMessageAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        Args {
            chat_context: BotChatContext::from_action_context(
                &self.client.context,
                self.channel_id,
            )
            .unwrap(),
            thread: self.thread,
            message_id: self.message_id,
            replies_to: self.replies_to,
            content: self.content,
            block_level_markdown: self.block_level_markdown,
            finalised: self.finalised,
        }
    }
}
