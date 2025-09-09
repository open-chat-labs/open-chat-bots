use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::chat_events::*;
use crate::types::BotChatContext;
use crate::types::MessageIndex;
use crate::types::{ActionContext, CanisterId, ChannelId};
use std::sync::Arc;

pub struct ChatEventsBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    thread: Option<MessageIndex>,
    events: EventsSelectionCriteria,
}

impl<'c, R: Runtime, C: ActionContext> ChatEventsBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, events: EventsSelectionCriteria) -> Self {
        let thread = client.context.thread();

        ChatEventsBuilder {
            client,
            channel_id: None,
            thread,
            events,
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

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for ChatEventsBuilder<'_, R, C> {
    type Action = ChatEventsAction;

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
            events: self.events,
            thread: self.thread,
        }
    }
}
