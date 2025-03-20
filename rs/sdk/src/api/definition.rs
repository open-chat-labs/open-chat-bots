use crate::types::ChatRole;
use candid::CandidType;
use serde::{Deserialize, Serialize};

pub use crate::types::{BotPermissions, ChatPermission, CommunityPermission, MessagePermission};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotDefinition {
    pub description: String,
    pub commands: Vec<BotCommandDefinition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub autonomous_config: Option<AutonomousConfig>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotCommandDefinition {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub params: Vec<BotCommandParam>,
    pub permissions: BotPermissions,
    pub default_role: Option<ChatRole>,
    pub direct_messages: bool,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct AutonomousConfig {
    pub permissions: BotPermissions,
    pub sync_api_key: bool,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotCommandParam {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub required: bool,
    pub param_type: BotCommandParamType,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum BotCommandParamType {
    BooleanParam,
    StringParam(StringParam),
    IntegerParam(IntegerParam),
    DecimalParam(DecimalParam),
    DateTimeParam(DateTimeParam),
    UserParam,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct StringParam {
    pub min_length: u16,
    pub max_length: u16,
    pub choices: Vec<BotCommandOptionChoice<String>>,
    #[serde(default)]
    pub multi_line: bool,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct IntegerParam {
    pub min_value: i64,
    pub max_value: i64,
    pub choices: Vec<BotCommandOptionChoice<i64>>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct DecimalParam {
    pub min_value: f64,
    pub max_value: f64,
    pub choices: Vec<BotCommandOptionChoice<f64>>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotCommandOptionChoice<T> {
    pub name: String,
    pub value: T,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct DateTimeParam {
    pub future_only: bool,
}
