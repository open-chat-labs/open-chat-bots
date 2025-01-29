use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum GetAccessTokenArgs {
    BotActionByApiKey(String),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum GetAccessTokenResponse {
    Success(String),
    NotAuthorized,
    InternalError(String),
}
