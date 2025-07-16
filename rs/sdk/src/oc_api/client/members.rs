use super::Client;
use crate::oc_api::actions::members::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::BotCommunityOrGroupContext;
use crate::types::{ActionContext, CanisterId, ChannelId};
use std::collections::HashSet;
use std::sync::Arc;

pub struct MembersBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    member_types: HashSet<MemberType>,
}

impl<'c, R: Runtime, C: ActionContext> MembersBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, member_types: HashSet<MemberType>) -> Self {
        MembersBuilder {
            client,
            channel_id: None,
            member_types,
        }
    }

    pub fn in_channel(mut self, channel_id: Option<ChannelId>) -> Self {
        self.channel_id = channel_id;
        self
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for MembersBuilder<'_, R, C> {
    type Action = MembersAction;

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
            member_types: self.member_types,
        }
    }
}
