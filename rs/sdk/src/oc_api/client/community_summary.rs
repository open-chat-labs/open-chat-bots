use super::Client;
use crate::oc_api::actions::community_summary::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::{ActionContext, CanisterId};
use std::sync::Arc;

pub struct CommunitySummaryBuilder<'c, R, C> {
    client: &'c Client<R, C>,
}

impl<'c, R: Runtime, C: ActionContext> CommunitySummaryBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>) -> Self {
        CommunitySummaryBuilder { client }
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for CommunitySummaryBuilder<'_, R, C> {
    type Action = CommunitySummaryAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        Args {
            community_id: self.client.context.scope().community_id().unwrap(),
        }
    }
}
