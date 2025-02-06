use candid::CandidType;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotDefinition {
    pub description: String,
    pub commands: Vec<SlashCommandSchema>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub autonomous_config: Option<AutonomousConfig>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct SlashCommandSchema {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub params: Vec<SlashCommandParam>,
    pub permissions: BotPermissions,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct AutonomousConfig {
    pub permissions: BotPermissions,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct SlashCommandParam {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub required: bool,
    pub param_type: SlashCommandParamType,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum SlashCommandParamType {
    UserParam,
    BooleanParam,
    StringParam(StringParam),
    IntegerParam(IntegerParam),
    DecimalParam(DecimalParam),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct StringParam {
    pub min_length: u16,
    pub max_length: u16,
    pub choices: Vec<SlashCommandOptionChoice<String>>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct IntegerParam {
    pub min_value: i64,
    pub max_value: i64,
    pub choices: Vec<SlashCommandOptionChoice<i64>>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct DecimalParam {
    pub min_value: f64,
    pub max_value: f64,
    pub choices: Vec<SlashCommandOptionChoice<f64>>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct SlashCommandOptionChoice<T> {
    pub name: String,
    pub value: T,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Default)]
pub struct BotPermissions {
    pub community: HashSet<CommunityPermission>,
    pub chat: HashSet<GroupPermission>,
    pub message: HashSet<MessagePermission>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CommunityPermission {
    ChangeRoles,
    UpdateDetails,
    InviteUsers,
    RemoveMembers,
    CreatePublicChannel,
    CreatePrivateChannel,
    ManageUserGroups,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum GroupPermission {
    ChangeRoles,
    UpdateGroup,
    AddMembers,
    InviteUsers,
    RemoveMembers,
    DeleteMessages,
    PinMessages,
    ReactToMessages,
    MentionAllMembers,
    StartVideoCall,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum MessagePermission {
    Text,
    Image,
    Video,
    Audio,
    File,
    Poll,
    Crypto,
    Giphy,
    Prize,
    P2pSwap,
    VideoCall,
}
