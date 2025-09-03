use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::community_events::{
    Args, CommunityEventsAction, EventsSelectionCriteria,
};
use crate::types::{ActionContext, CanisterId};
use std::sync::Arc;

pub struct CommunityEventsBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    events: EventsSelectionCriteria,
}

impl<'c, R: Runtime, C: ActionContext> CommunityEventsBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, events: EventsSelectionCriteria) -> Self {
        CommunityEventsBuilder { client, events }
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for CommunityEventsBuilder<'_, R, C> {
    type Action = CommunityEventsAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        Args {
            community_id: self.client.context.scope().community_id().unwrap(),
            events: self.events,
        }
    }
}
