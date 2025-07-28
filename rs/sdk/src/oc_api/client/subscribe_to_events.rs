use super::Client;
use crate::oc_api::actions::subscribe_to_events::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::ChatEventType;
use crate::types::CommunityEventType;
use crate::types::{ActionContext, CanisterId, ChannelId};
use std::collections::HashSet;
use std::sync::Arc;

pub struct SubscribeToEventsBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    chat_events: HashSet<ChatEventType>,
    communty_events: HashSet<CommunityEventType>,
}

impl<'c, R: Runtime, C: ActionContext> SubscribeToEventsBuilder<'c, R, C> {
    pub fn new(
        client: &'c Client<R, C>,
        chat_events: HashSet<ChatEventType>,
        communty_events: HashSet<CommunityEventType>,
    ) -> Self {
        SubscribeToEventsBuilder {
            client,
            channel_id: None,
            chat_events,
            communty_events,
        }
    }

    pub fn with_channel_id(mut self, channel_id: ChannelId) -> Self {
        self.channel_id = Some(channel_id);
        self
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for SubscribeToEventsBuilder<'_, R, C> {
    type Action = SubscribeToChatEventsAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        let mut scope = self.client.context.scope();

        if let Some(channel_id) = self.channel_id {
            scope = scope.with_channel_id(channel_id);
        }

        Args {
            scope,
            community_events: self.communty_events,
            chat_events: self.chat_events,
        }
    }
}
