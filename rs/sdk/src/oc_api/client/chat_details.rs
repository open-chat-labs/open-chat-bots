use super::Client;
use crate::oc_api::actions::chat_details::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::{ActionContext, CanisterId, ChannelId};
use std::sync::Arc;

pub struct ChatDetailsBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
}

impl<'c, R: Runtime, C: ActionContext> ChatDetailsBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>) -> Self {
        let channel_id = client.context.channel_id();

        ChatDetailsBuilder { client, channel_id }
    }

    // This only takes effect for community scope
    pub fn with_channel_id(mut self, channel_id: ChannelId) -> Self {
        if self.channel_id.is_none() {
            self.channel_id = Some(channel_id);
        }
        self
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for ChatDetailsBuilder<'_, R, C> {
    type Action = ChatDetailsAction;

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
