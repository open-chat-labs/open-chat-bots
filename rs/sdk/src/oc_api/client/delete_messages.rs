use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::delete_messages::{Args, DeleteMessagesAction};
use crate::types::{ActionContext, BotChatContext, CanisterId, ChannelId, MessageId, MessageIndex};
use std::sync::Arc;

pub struct DeleteMessagesBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    thread: Option<MessageIndex>,
    message_ids: Vec<MessageId>,
}

impl<'c, R: Runtime, C: ActionContext> DeleteMessagesBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, message_ids: Vec<MessageId>) -> Self {
        let thread = client.context.thread();

        DeleteMessagesBuilder {
            client,
            channel_id: None,
            thread,
            message_ids,
        }
    }

    // This only takes effect for community scope
    pub fn with_channel_id(mut self, channel_id: ChannelId) -> Self {
        self.channel_id = Some(channel_id);
        self
    }

    pub fn with_thread(mut self, thread: Option<MessageIndex>) -> Self {
        if self.thread.is_none() {
            self.thread = thread;
        }
        self
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for DeleteMessagesBuilder<'_, R, C> {
    type Action = DeleteMessagesAction;

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
            message_ids: self.message_ids,
            thread: self.thread,
        }
    }
}
