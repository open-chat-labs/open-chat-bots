use super::Client;
use crate::oc_api::actions::chat_events::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::{ActionContext, CanisterId, ChannelId};
use std::sync::Arc;

pub struct ChatEventsBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    events: EventsSelectionCriteria,
}

impl<'c, R: Runtime, C: ActionContext> ChatEventsBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, events: EventsSelectionCriteria) -> Self {
        let channel_id = client.context.channel_id();

        ChatEventsBuilder {
            client,
            channel_id,
            events,
        }
    }

    // This only takes effect for community scope
    pub fn with_channel_id(mut self, channel_id: ChannelId) -> Self {
        if self.channel_id.is_none() {
            self.channel_id = Some(channel_id);
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
            auth_token: self.client.context.auth_token().clone(),
            channel_id: self.channel_id,
            events: self.events,
        }
    }
}
