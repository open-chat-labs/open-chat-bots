use super::{AccessTokenScope, CanisterId, UserId};
use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotApiKeyToken {
    pub gateway: CanisterId,
    pub bot_id: UserId,
    pub scope: AccessTokenScope,
    pub secret: String,
}
