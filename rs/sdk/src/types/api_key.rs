use super::{ActionScope, BotPermissions, CanisterId, UserId};
use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotApiKeyToken {
    pub gateway: CanisterId,
    pub bot_id: UserId,
    pub scope: ActionScope,
    pub secret: String,
    pub permissions: BotPermissions,
}
