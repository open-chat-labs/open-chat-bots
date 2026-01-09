use crate::types::{ActionContext, ActionScope, ChannelId, Chat};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum BotChatContext {
    Command(String),
    Autonomous(Chat),
}

impl BotChatContext {
    pub fn from_action_context<C: ActionContext>(
        context: &C,
        channel_id: Option<ChannelId>,
    ) -> Option<Self> {
        if let Some(jwt) = context.jwt() {
            return Some(Self::Command(jwt));
        }

        match context.scope() {
            ActionScope::Chat(chat) => Some(Self::Autonomous(chat)),
            ActionScope::Community(community_id) => channel_id
                .map(|channel_id| Self::Autonomous(Chat::Channel(community_id, channel_id))),
        }
    }
}
