use super::{AccessTokenScope, BotActionScope, BotPermissions, CanisterId, UserId};
use crate::api::Command;
use candid::CandidType;
use serde::{Deserialize, Serialize};

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
