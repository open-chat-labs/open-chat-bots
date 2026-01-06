use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::change_role::{Args, ChangeRoleAction};
use crate::types::{ActionContext, BotChatContext, CanisterId, ChannelId, ChatRole, UserId};
use std::sync::Arc;

pub struct ChangeRoleBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    user_ids: Vec<UserId>,
    new_role: ChatRole,
}

impl<'c, R: Runtime, C: ActionContext> ChangeRoleBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, user_ids: Vec<UserId>, new_role: ChatRole) -> Self {
        ChangeRoleBuilder {
            client,
            channel_id: None,
            user_ids,
            new_role,
        }
    }

    // This only takes effect for community scope
    pub fn with_channel_id(mut self, channel_id: ChannelId) -> Self {
        self.channel_id = Some(channel_id);
        self
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for ChangeRoleBuilder<'_, R, C> {
    type Action = ChangeRoleAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        Args {
            chat_context: BotChatContext::from_action_context(
                &self.client.context,
                self.channel_id,
            )
            .unwrap(),
            user_ids: self.user_ids,
            new_role: self.new_role,
        }
    }
}
