use candid::CandidType;
use serde::{Deserialize, Serialize};

use super::MessageContent;

#[derive(CandidType, Serialize, Clone, Debug)]
pub struct ActionArgs {
    pub action: BotAction,
    pub jwt: String,
}

pub type CallResult<T> = Result<T, CallError>;
pub type CallError = (i32, String);
pub type ActionResponse = Result<(), BotApiError>;

#[derive(CandidType, Deserialize, Clone, Debug)]
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

#[derive(CandidType, Serialize, Clone, Debug)]
pub enum BotAction {
    SendMessage(BotMessageAction),
}

#[derive(CandidType, Serialize, Clone, Debug)]
pub struct BotMessageAction {
    pub content: MessageContent,
    pub finalised: bool,
}
