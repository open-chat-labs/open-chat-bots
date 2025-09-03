use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::remove_user::{Args, RemoveUserAction};
use crate::types::{ActionContext, BotCommunityOrGroupContext, CanisterId, ChannelId, UserId};
use std::sync::Arc;

pub struct RemoveUserBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    user_id: UserId,
    block: bool,
}

impl<'c, R: Runtime, C: ActionContext> RemoveUserBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, user_id: UserId) -> Self {
        RemoveUserBuilder {
            client,
            channel_id: None,
            user_id,
            block: false,
        }
    }

    // This must be set for the user to be removed from a channel rather than the whole community
    #[expect(clippy::wrong_self_convention)]
    pub fn from_channel_id(mut self, channel_id: ChannelId) -> Self {
        self.channel_id = Some(channel_id);
        self
    }

    // This will also block the user from re-joining the community or group
    pub fn and_block(mut self) -> Self {
        self.block = true;
        self
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for RemoveUserBuilder<'_, R, C> {
    type Action = RemoveUserAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        Args {
            community_or_group_context: BotCommunityOrGroupContext::from_action_context(
                &self.client.context,
            )
            .expect("Context must be a community or group"),
            channel_id: self.channel_id,
            user_id: self.user_id,
            block: self.block,
        }
    }
}
