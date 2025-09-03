use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::chat_summary::*;
use crate::types::BotChatContext;
use crate::types::{ActionContext, CanisterId, ChannelId};
use std::sync::Arc;

pub struct ChatSummaryBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
}

impl<'c, R: Runtime, C: ActionContext> ChatSummaryBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>) -> Self {
        ChatSummaryBuilder {
            client,
            channel_id: None,
        }
    }

    // This only takes effect for community scope
    pub fn with_channel_id(mut self, channel_id: ChannelId) -> Self {
        self.channel_id = Some(channel_id);
        self
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for ChatSummaryBuilder<'_, R, C> {
    type Action = ChatSummaryAction;

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
        }
    }
}
