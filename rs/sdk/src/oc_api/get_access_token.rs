use crate::api::command::Command;
use crate::types::{BotCommandScope, UserId};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[expect(clippy::large_enum_variant)]
pub enum GetAccessTokenArgs {
    BotActionByApiKey(String),
    BotActionByCommand(BotActionByCommandArgs),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum GetAccessTokenResponse {
    Success(String),
    NotAuthorized,
    InternalError(String),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BotActionByCommandArgs {
    pub bot_id: UserId,
    pub command: Command,
    pub scope: BotCommandScope,
}
