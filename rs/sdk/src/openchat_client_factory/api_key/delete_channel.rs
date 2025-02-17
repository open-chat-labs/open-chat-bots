use crate::{
    api::delete_channel,
    types::{CallResult, ChannelId},
    Runtime,
};

use super::OpenChatClientForApiKey;

pub struct DeleteChannelBuilder<R> {
    client: OpenChatClientForApiKey<R>,
    channel_id: ChannelId,
}

impl<R: Runtime + Send + Sync + 'static> DeleteChannelBuilder<R> {
    pub fn new(client: OpenChatClientForApiKey<R>, channel_id: ChannelId) -> Self {
        DeleteChannelBuilder { client, channel_id }
    }

    pub fn execute<
        F: FnOnce(delete_channel::Args, CallResult<delete_channel::Response>) + Send + Sync + 'static,
    >(
        self,
        on_response: F,
    ) {
        let runtime = self.client.runtime.clone();
        let runtime_clone = self.client.runtime.clone();
        let bot_api_gateway = self.client.context.api_gateway;
        let args = self.into_args();

        runtime.spawn(async move {
            let response = runtime_clone
                .delete_channel(bot_api_gateway, args.clone())
                .await
                .map(|(r,)| r);

            on_response(args, response);
        });
    }

    pub async fn execute_async(self) -> CallResult<delete_channel::Response> {
        let runtime = self.client.runtime.clone();
        let bot_api_gateway = self.client.context.api_gateway;
        let args = self.into_args();

        runtime
            .delete_channel(bot_api_gateway, args)
            .await
            .map(|(r,)| r)
    }

    fn into_args(self) -> delete_channel::Args {
        delete_channel::Args {
            auth_token: self.client.context.token,
            channel_id: self.channel_id,
        }
    }
}
