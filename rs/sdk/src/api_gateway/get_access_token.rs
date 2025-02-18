use crate::api::Command;
use crate::types::{BotActionScope, UserId};
use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum GetAccessTokenArgs {
    BotActionByApiKey(String),
    BotActionByCommand(BotActionByCommandArgs),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum GetAccessTokenResponse {
    Success(String),
    NotAuthorized,
    InternalError(String),
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct BotActionByCommandArgs {
    pub bot_id: UserId,
    pub command: Command,
    pub scope: BotActionScope,
}
