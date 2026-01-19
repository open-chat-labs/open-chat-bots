use crate::types::{ActionContext, ActionScope, Chat, ChatId, CommunityId};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum BotCommunityOrGroupContext {
    Command(String),
    Autonomous(CommunityOrGroup),
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CommunityOrGroup {
    Community(CommunityId),
    Group(ChatId),
}

impl BotCommunityOrGroupContext {
    pub fn from_action_context<C: ActionContext>(context: &C) -> Option<Self> {
        if let Some(jwt) = context.jwt() {
            return Some(Self::Command(jwt));
        }

        match context.scope() {
            ActionScope::Chat(Chat::Direct(_)) => None,
            ActionScope::Chat(Chat::Group(chat_id)) => {
                Some(Self::Autonomous(CommunityOrGroup::Group(chat_id)))
            }
            ActionScope::Community(community_id) => {
                Some(Self::Autonomous(CommunityOrGroup::Community(community_id)))
            }
            ActionScope::Chat(Chat::Channel(community_id, _)) => {
                Some(Self::Autonomous(CommunityOrGroup::Community(community_id)))
            }
        }
    }
}
