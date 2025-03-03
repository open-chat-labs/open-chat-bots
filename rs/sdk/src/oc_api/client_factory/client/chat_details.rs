use super::Client;
use crate::oc_api::actions::chat_details::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::types::{CanisterId, ChannelId};
use crate::Runtime;
use std::sync::Arc;

pub struct ChatDetailsBuilder<R> {
    client: Client<R>,
    channel_id: Option<ChannelId>,
}

impl<R: Runtime> ChatDetailsBuilder<R> {
    pub fn new(client: Client<R>) -> Self {
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

impl<R: Runtime> ActionArgsBuilder<R> for ChatDetailsBuilder<R> {
    type Action = ChatDetailsAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn bot_api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        Args {
            auth_token: self.client.context.into_token(),
            channel_id: self.channel_id,
        }
    }
}
