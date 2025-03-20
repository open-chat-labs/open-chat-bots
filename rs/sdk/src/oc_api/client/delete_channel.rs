use super::Client;
use crate::oc_api::actions::delete_channel::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::{ActionContext, CanisterId, ChannelId};
use std::sync::Arc;

pub struct DeleteChannelBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: ChannelId,
}

impl<'c, R: Runtime, C: ActionContext> DeleteChannelBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, channel_id: ChannelId) -> Self {
        DeleteChannelBuilder { client, channel_id }
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for DeleteChannelBuilder<'_, R, C> {
    type Action = DeleteChannelAction;

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
        }
    }
}
