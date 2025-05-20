use super::Client;
use crate::oc_api::actions::subscribe_to_events::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::ChatEventType;
use crate::types::CommunityEventType;
use crate::types::{ActionContext, CanisterId, ChannelId};
use std::collections::HashSet;
use std::sync::Arc;

pub struct SubscribeToChatEventsBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    chat_events: HashSet<ChatEventType>,
    communty_events: HashSet<CommunityEventType>,
}

impl<'c, R: Runtime, C: ActionContext> SubscribeToChatEventsBuilder<'c, R, C> {
    pub fn new(
        client: &'c Client<R, C>,
        chat_events: HashSet<ChatEventType>,
        communty_events: HashSet<CommunityEventType>,
    ) -> Self {
        SubscribeToChatEventsBuilder {
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

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for SubscribeToChatEventsBuilder<'_, R, C> {
    type Action = SubscribeToChatEventsAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        Args {
            scope: self.client.context.scope(),
            community_events: self.communty_events,
            chat_events: self.chat_events,
        }
    }
}
