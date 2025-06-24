use super::Client;
use crate::oc_api::actions::remove_user::{Args, RemoveUserAction};
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::{
    ActionContext, ActionScope, BotCommunityOrGroupContext, CanisterId, ChannelId, Chat,
    CommunityOrGroup, UserId,
};
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
            community_or_group_context: extract_community_or_group_context(&self.client.context)
                .expect("Context must be a community or group"),
            channel_id: self.channel_id,
            user_id: self.user_id,
            block: self.block,
        }
    }
}

fn extract_community_or_group_context<C: ActionContext>(
    context: &C,
) -> Option<BotCommunityOrGroupContext> {
    if let Some(jwt) = context.jwt() {
        return Some(BotCommunityOrGroupContext::Command(jwt));
    }

    match context.scope() {
        ActionScope::Chat(Chat::Direct(_)) => None,
        ActionScope::Chat(Chat::Group(chat_id)) => Some(BotCommunityOrGroupContext::Autonomous(
            CommunityOrGroup::Group(chat_id),
        )),
        ActionScope::Community(community_id) => Some(BotCommunityOrGroupContext::Autonomous(
            CommunityOrGroup::Community(community_id),
        )),
        ActionScope::Chat(Chat::Channel(community_id, _)) => Some(
            BotCommunityOrGroupContext::Autonomous(CommunityOrGroup::Community(community_id)),
        ),
    }
}
