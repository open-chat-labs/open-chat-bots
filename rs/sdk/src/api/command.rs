use crate::types::{MessageContent, MessageId, UserId};
use candid::CandidType;
use serde::{Deserialize, Serialize};

mod command_handler;

pub use command_handler::{CommandHandler, CommandHandlerRegistry};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Command {
    pub name: String,
    pub args: Vec<CommandArg>,
    pub initiator: UserId,
}

impl Command {
    pub fn maybe_arg<T: TryFrom<CommandArgValue>>(&self, name: &str) -> Option<T> {
        let value = self
            .args
            .iter()
            .find(|arg| arg.name == name)
            .map(|a| a.value.clone())?;

        T::try_from(value).ok()
    }

    pub fn arg<T: TryFrom<CommandArgValue>>(&self, name: &str) -> T {
        self.maybe_arg(name)
            .expect("Argument missing or unexpected type")
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

impl TryFrom<CommandArgValue> for String {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value.as_string().map(|s| s.to_string()).ok_or(())
    }
}

impl TryFrom<CommandArgValue> for i64 {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value.as_integer().ok_or(())
    }
}

impl TryFrom<CommandArgValue> for i32 {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value
            .as_integer()
            .and_then(|r| i32::try_from(r).ok())
            .ok_or(())
    }
}

impl TryFrom<CommandArgValue> for i16 {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value
            .as_integer()
            .and_then(|r| i16::try_from(r).ok())
            .ok_or(())
    }
}

impl TryFrom<CommandArgValue> for i8 {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value
            .as_integer()
            .and_then(|r| i8::try_from(r).ok())
            .ok_or(())
    }
}

impl TryFrom<CommandArgValue> for u64 {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value
            .as_integer()
            .and_then(|r| u64::try_from(r).ok())
            .ok_or(())
    }
}

impl TryFrom<CommandArgValue> for u32 {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value
            .as_integer()
            .and_then(|r| u32::try_from(r).ok())
            .ok_or(())
    }
}

impl TryFrom<CommandArgValue> for u16 {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value
            .as_integer()
            .and_then(|r| u16::try_from(r).ok())
            .ok_or(())
    }
}

impl TryFrom<CommandArgValue> for u8 {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value
            .as_integer()
            .and_then(|r| u8::try_from(r).ok())
            .ok_or(())
    }
}

impl TryFrom<CommandArgValue> for f64 {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value.as_decimal().ok_or(())
    }
}

impl TryFrom<CommandArgValue> for f32 {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value.as_decimal().map(|r| r as f32).ok_or(())
    }
}

impl TryFrom<CommandArgValue> for bool {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value.as_bool().ok_or(())
    }
}

impl TryFrom<CommandArgValue> for UserId {
    type Error = ();

    fn try_from(value: CommandArgValue) -> Result<Self, Self::Error> {
        value.as_user().ok_or(())
    }
}

#[allow(clippy::large_enum_variant)]
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum CommandResponse {
    Success(SuccessResult),
    BadRequest(BadRequest),
    TooManyRequests,
    InternalError(InternalError),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct SuccessResult {
    pub message: Option<Message>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Message {
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
    CommandError(String),
    CanisterError(CanisterError),
    C2CError(i32, String),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum CanisterError {
    NotAuthorized,
    Frozen,
    Other(String),
}
