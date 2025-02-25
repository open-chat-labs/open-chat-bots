use super::{
    ActionScope, CanisterId, Chat, EncodedBotPermissions, MessageId, MessageIndex, UserId,
};
use crate::api::command::Command;
use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(Debug)]
pub enum TokenError {
    Invalid(String),
    Expired,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotActionByCommandClaims {
    pub bot_api_gateway: CanisterId,
    pub bot: UserId,
    pub scope: BotCommandScope,
    pub granted_permissions: EncodedBotPermissions,
    pub command: Command,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotActionByApiKeyClaims {
    pub bot_api_gateway: CanisterId,
    pub bot: UserId,
    pub scope: ActionScope,
    pub granted_permissions: EncodedBotPermissions,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum BotCommandScope {
    Chat(BotActionChatDetails),
    Community(BotActionCommunityDetails),
}

impl BotCommandScope {
    pub fn message_id(&self) -> Option<MessageId> {
        match self {
            BotCommandScope::Chat(details) => Some(details.message_id),
            BotCommandScope::Community(_) => None,
        }
    }
}

impl From<BotCommandScope> for ActionScope {
    fn from(value: BotCommandScope) -> Self {
        match value {
            BotCommandScope::Chat(details) => ActionScope::Chat(details.chat),
            BotCommandScope::Community(details) => ActionScope::Community(details.community_id),
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotActionChatDetails {
    pub chat: Chat,
    pub thread: Option<MessageIndex>,
    pub message_id: MessageId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotActionCommunityDetails {
    pub community_id: CanisterId,
}
