use super::OpenChatClientForApiKey;
use crate::api_gateway::actions::delete_channel::*;
use crate::api_gateway::actions::ActionArgsBuilder;
use crate::types::{CanisterId, ChannelId};
use crate::Runtime;
use std::sync::Arc;

pub struct DeleteChannelBuilder<R> {
    client: OpenChatClientForApiKey<R>,
    channel_id: ChannelId,
}

impl<R: Runtime> DeleteChannelBuilder<R> {
    pub fn new(client: OpenChatClientForApiKey<R>, channel_id: ChannelId) -> Self {
        DeleteChannelBuilder { client, channel_id }
    }
}

impl<R: Runtime> ActionArgsBuilder<R> for DeleteChannelBuilder<R> {
    type Action = DeleteChannelAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn bot_api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway
    }

    fn into_args(self) -> Args {
        Args {
            auth_token: self.client.context.token,
            channel_id: self.channel_id,
        }
    }
}
