use crate::types::{ChatEventType, ChatRole, CommunityEventType, InstallationLocationType};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub use crate::types::{BotPermissions, ChatPermission, CommunityPermission, MessagePermission};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BotDefinition {
    pub description: String,
    pub commands: Vec<BotCommandDefinition>,
    pub autonomous_config: Option<AutonomousConfig>,
    pub default_subscriptions: Option<BotSubscriptions>,
    pub restricted_locations: Option<HashSet<InstallationLocationType>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BotCommandDefinition {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub params: Vec<BotCommandParam>,
    pub permissions: BotPermissions,
    pub default_role: Option<ChatRole>,
    pub direct_messages: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AutonomousConfig {
    pub permissions: BotPermissions,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BotCommandParam {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub required: bool,
    pub param_type: BotCommandParamType,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum BotCommandParamType {
    BooleanParam,
    StringParam(StringParam),
    IntegerParam(IntegerParam),
    DecimalParam(DecimalParam),
    DateTimeParam(DateTimeParam),
    UserParam,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StringParam {
    pub min_length: u16,
    pub max_length: u16,
    pub choices: Vec<BotCommandOptionChoice<String>>,
    #[serde(default)]
    pub multi_line: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct IntegerParam {
    pub min_value: i64,
    pub max_value: i64,
    pub choices: Vec<BotCommandOptionChoice<i64>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DecimalParam {
    pub min_value: f64,
    pub max_value: f64,
    pub choices: Vec<BotCommandOptionChoice<f64>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BotCommandOptionChoice<T> {
    pub name: String,
    pub value: T,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DateTimeParam {
    pub future_only: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct BotSubscriptions {
    pub community: HashSet<CommunityEventType>,
    pub chat: HashSet<ChatEventType>,
}
