use super::{CanisterId, Chat, MessageContent, MessageId, MessageIndex};
use crate::api::{CommunityPermission, GroupPermission, MessagePermission};
use crate::types::deserialize_message_id;
use candid::CandidType;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ActionArgs {
    pub action: BotAction,
    pub jwt: String,
}

pub type CallResult<T> = Result<T, CallError>;
pub type CallError = (i32, String);
pub type ActionResponse = Result<(), BotApiError>;

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum BotApiError {
    Invalid(String),
    CanisterError(CanisterError),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum CanisterError {
    NotAuthorized,
    Frozen,
    Other(String),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum BotAction {
    SendMessage(BotMessageAction),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotMessageAction {
    pub content: MessageContent,
    pub finalised: bool,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum BotActionScope {
    Chat(BotActionChatDetails),
    Community(BotActionCommunityDetails),
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
    #[serde(deserialize_with = "deserialize_message_id")]
    pub message_id: MessageId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotActionCommunityDetails {
    pub community_id: CanisterId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotPermissions {
    pub community: HashSet<CommunityPermission>,
    pub chat: HashSet<GroupPermission>,
    pub message: HashSet<MessagePermission>,
}
