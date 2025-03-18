use crate::api::command::Command;
use crate::types::{BotCommandScope, UserId};
use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Debug)]
#[allow(clippy::large_enum_variant)]
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
    pub scope: BotCommandScope,
}
