use crate::types::{MessageContent, MessageId, UserId};
use crate::utils::serialize_u64;
use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Command {
    pub name: String,
    pub args: Vec<CommandArg>,
    pub initiator: UserId,
}

impl Command {
    pub fn get_arg(&self, name: &str) -> Option<&CommandArg> {
        self.args.iter().find(|arg| arg.name == name)
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommandArg {
    pub name: String,
    pub value: CommandArgValue,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum CommandArgValue {
    String(String),
    Integer(i64),
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
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum CommandResponse {
    Success(SuccessResult),
    BadRequest(BadRequest),
    InternalError(InternalError),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct SuccessResult {
    pub message: Option<Message>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Message {
    #[serde(serialize_with = "serialize_u64")]
    pub id: MessageId,
    pub content: MessageContent,
    pub block_level_markdown: bool,
    pub finalised: bool,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum BadRequest {
    AccessTokenNotFound,
    AccessTokenInvalid,
    AccessTokenExpired,
    CommandNotFound,
    ArgsInvalid,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
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
