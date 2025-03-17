use crate::types::{MessageContentInitial, MessageId, TimestampMillis, UserId};
use candid::CandidType;
use serde::{Deserialize, Serialize};

pub use command_handler::{CommandHandler, CommandHandlerRegistry};

mod command_handler;

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Command {
    pub name: String,
    pub args: Vec<CommandArg>,
    pub initiator: UserId,
    pub meta: Option<CommandMeta>,
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

    pub fn timezone(&self) -> &str {
        self.meta
            .as_ref()
            .map(|meta| meta.timezone.as_str())
            .unwrap_or("UTC")
    }

    pub fn language(&self) -> &str {
        self.meta
            .as_ref()
            .map(|meta| meta.language.as_str())
            .unwrap_or("en")
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
    DateTime(TimestampMillis),
}

impl CommandArgValue {
    pub fn as_string(&self) -> Option<&str> {
        if let Self::String(s) = self {
            Some(s)
        } else {
            None
        }
    }

    pub fn as_integer(&self) -> Option<i64> {
        if let Self::Integer(n) = self {
            Some(*n)
        } else {
            None
        }
    }

    pub fn as_decimal(&self) -> Option<f64> {
        if let Self::Decimal(n) = self {
            Some(*n)
        } else {
            None
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        if let Self::Boolean(b) = self {
            Some(*b)
        } else {
            None
        }
    }

    pub fn as_user(&self) -> Option<UserId> {
        if let Self::User(u) = self {
            Some(*u)
        } else {
            None
        }
    }

    pub fn as_datetime(&self) -> Option<TimestampMillis> {
        if let Self::DateTime(a) = self {
            Some(*a)
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
        match value {
            CommandArgValue::Integer(i) => u64::try_from(i).map_err(|_| ()),
            CommandArgValue::DateTime(t) => Ok(t),
            _ => Err(()),
        }
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
    pub(crate) id: MessageId,
    pub(crate) content: MessageContentInitial,
    pub(crate) block_level_markdown: bool,
    pub(crate) finalised: bool,
    pub(crate) ephemeral: bool,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum BadRequest {
    AccessTokenNotFound,
    AccessTokenInvalid(String),
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

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct CommandMeta {
    pub timezone: String, // IANA timezone e.g. "Europe/London"
    pub language: String, // The language selected in OpenChat e.g. "en"
}

/// Replying with an ephemeral [`Message`]!
///
/// Ephemeral messages are not saved to the OC backend, and can only be used
/// as a bot's reply sent to the OC UI. Ephemeral messages will only be
/// visible for the user that initiated interaction with a bot, and they will
/// dissapear upon UI refresh.
///
/// Here's a short example on how to use it:
/// ```ignore
/// use oc_bots_sdk::api::command::EphemeralMessageBuilder;
///
/// ...
/// // Somewhere in your bot code, replying to a command...
/// Ok(EphemeralMessageBuilder::new(ctx)
///     .with_text_content("Hello, world! This is an ephemeral message, only visible to you.".into())
///     .build()?
///     .into())
/// ```
///
/// In this example we're setting textual content for the message, but you
/// have an option to use [`EphemeralMessageBuilder::with_content`], and provide
/// any of the supported content types.
///
/// Once your ephemeral message is constructed, using `.into()` will transform
/// the type into a [`SuccessResult`], which can then be wrapped into `Result::Ok`
/// and returned as a reply for the UI.
pub struct EphemeralMessageBuilder {
    message_id: MessageId,
    content: MessageContentInitial,
    block_level_markdown: bool,
}

impl EphemeralMessageBuilder {
    pub fn new(content: MessageContentInitial, message_id: MessageId) -> Self {
        Self {
            message_id,
            content,
            block_level_markdown: false,
        }
    }

    /// Indicates if your text content contains markdown or not.
    pub fn with_block_level_markdown(self, block_level_markdown: bool) -> Self {
        Self {
            block_level_markdown,
            ..self
        }
    }

    /// Builds a [`Message`] type from the provided data, with the `ephemeral`
    /// flag set to `true`.
    pub fn build(self) -> Message {
        Message {
            id: self.message_id,
            content: self.content,
            block_level_markdown: self.block_level_markdown,
            finalised: true,
            ephemeral: true,
        }
    }
}

impl From<Message> for SuccessResult {
    fn from(message: Message) -> Self {
        SuccessResult {
            message: Some(message),
        }
    }
}
