use crate::types::{AuthToken, ChannelId};
use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub channel_id: ChannelId,
    pub auth_token: AuthToken,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum Response {
    Success,
    ChannelNotFound,
    FailedAuthentication(String),
    InvalidRequest(String),
    NotAuthorized,
    Frozen,
    C2CError(i32, String),
}
