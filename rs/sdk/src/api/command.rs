use candid::CandidType;
use serde::{Deserialize, Serialize};

use crate::types::{MessageContent, MessageId, UserId};

#[derive(Serialize, Deserialize, Debug)]
pub struct Command {
    pub name: String,
    pub args: Vec<CommandArg>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CommandArg {
    pub name: String,
    pub value: CommandArgValue,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum CommandArgValue {
    String(String),
    Integer(i64),
    #[serde(alias = "Number")]
    Decimal(f64),
    Boolean(bool),
    User(UserId),
}

impl CommandArgValue {
    pub fn as_string(&self) -> Option<&str> {
        if let CommandArgValue::String(s) = self {
            Some(s)
        } else {
            None
        }
    }

    pub fn as_integer(&self) -> Option<i64> {
        if let CommandArgValue::Integer(n) = self {
            Some(*n)
        } else {
            None
        }
    }

    pub fn as_decimal(&self) -> Option<f64> {
        if let CommandArgValue::Decimal(n) = self {
            Some(*n)
        } else {
            None
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        if let CommandArgValue::Boolean(b) = self {
            Some(*b)
        } else {
            None
        }
    }

    pub fn as_user(&self) -> Option<UserId> {
        if let CommandArgValue::User(u) = self {
            Some(*u)
        } else {
            None
        }
    }
}

#[allow(clippy::large_enum_variant)]
#[derive(Serialize)]
pub enum CommandResponse {
    Success(SuccessResult),
    BadRequest(BadRequest),
    InternalError(InternalError),
}

#[derive(Serialize)]
pub struct SuccessResult {
    pub message: Option<Message>,
}

#[derive(Serialize)]
pub struct Message {
    pub id: MessageId,
    pub content: MessageContent,
    pub finalised: bool,
}

#[derive(Serialize, Debug)]
pub enum BadRequest {
    AccessTokenNotFound,
    AccessTokenInvalid,
    AccessTokenExpired,
    CommandNotFound,
    ArgsInvalid,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum InternalError {
    Invalid(String),
    CanisterError(CanisterError),
    C2CError(i32, String),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum CanisterError {
    NotAuthorized,
    Frozen,
    Other(String),
}
