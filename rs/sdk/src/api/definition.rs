use std::collections::HashSet;

use crate::types::{ChatEventType, ChatRole, CommunityEventType, InstallationLocationType};
use candid::CandidType;
use serde::{Deserialize, Serialize};

pub use crate::types::{BotPermissions, ChatPermission, CommunityPermission, MessagePermission};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotDefinition {
    pub description: String,
    pub commands: Vec<BotCommandDefinition>,
    pub autonomous_config: Option<AutonomousConfig>,
    pub default_subscriptions: Option<BotSubscriptions>,
    pub data_encoding: Option<BotDataEncoding>,
    pub restricted_locations: Option<HashSet<InstallationLocationType>>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotCommandDefinition {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub params: Vec<BotCommandParam>,
    pub permissions: BotPermissions,
    pub default_role: Option<ChatRole>,
    pub direct_messages: Option<bool>,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct AutonomousConfig {
    pub permissions: BotPermissions,
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

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Default)]
pub struct BotSubscriptions {
    pub community: HashSet<CommunityEventType>,
    pub chat: HashSet<ChatEventType>,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone, Copy, Default)]
pub enum BotDataEncoding {
    #[default]
    MsgPack,
    Candid,
}
