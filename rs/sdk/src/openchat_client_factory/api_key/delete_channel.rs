use super::OpenChatClientForApiKey;
use crate::actions::ActionArgsBuilder;
use crate::api::delete_channel;
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
    type ActionArgs = delete_channel::Args;
    type ActionResponse = delete_channel::Response;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn bot_api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway
    }

    fn method_name(&self) -> &str {
        "bot_delete_channel"
    }

    fn into_args(self) -> Self::ActionArgs {
        delete_channel::Args {
            auth_token: self.client.context.token,
            channel_id: self.channel_id,
        }
    }
}
