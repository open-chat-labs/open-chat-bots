use super::Client;
use crate::oc_api::actions::add_reaction::{AddReactionAction, Args};
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::{ActionContext, CanisterId, ChannelId, MessageId, MessageIndex, Reaction};
use std::sync::Arc;

pub struct AddReactionBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    thread: Option<MessageIndex>,
    message_id: MessageId,
    reaction: Reaction,
}

impl<'c, R: Runtime, C: ActionContext> AddReactionBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, message_id: MessageId, reaction: Reaction) -> Self {
        let thread = client.context.thread();

        AddReactionBuilder {
            client,
            channel_id: None,
            thread,
            message_id,
            reaction,
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

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for AddReactionBuilder<'_, R, C> {
    type Action = AddReactionAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        Args {
            chat_context: self.client.context.chat_context(self.channel_id).unwrap(),
            thread: self.thread,
            message_id: self.message_id,
            reaction: self.reaction,
        }
    }
}
