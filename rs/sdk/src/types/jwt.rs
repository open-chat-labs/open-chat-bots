use super::{BotPermissions, CanisterId, Chat, MessageId, MessageIndex, UserId};
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
    pub scope: BotActionScope,
    pub granted_permissions: BotPermissions,
    pub command: Command,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotActionByApiKeyClaims {
    pub bot_api_gateway: CanisterId,
    pub bot: UserId,
    pub scope: AccessTokenScope,
    pub granted_permissions: BotPermissions,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum BotActionScope {
    Chat(BotActionChatDetails),
    Community(BotActionCommunityDetails),
}

impl BotActionScope {
    pub fn message_id(&self) -> Option<MessageId> {
        match self {
            BotActionScope::Chat(details) => Some(details.message_id),
            BotActionScope::Community(_) => None,
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub enum AccessTokenScope {
    Chat(Chat),
    Community(CanisterId),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotActionChatDetails {
    pub chat: Chat,
    pub thread_root_message_index: Option<MessageIndex>,
    pub message_id: MessageId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotActionCommunityDetails {
    pub community_id: CanisterId,
}
