use super::ActionDef;
use crate::types::{
    AccessGateConfig, ChannelId, CommunityId, CommunityPermissions, EventIndex, FrozenGroupInfo,
    OCError, TimestampMillis, VersionedRules,
};
use crate::utils::is_default;
use serde::{Deserialize, Serialize};

pub struct CommunitySummaryAction;

impl ActionDef for CommunitySummaryAction {
    type Args = Args;
    type Response = Response;

    fn method_name(is_canister_runtime: bool) -> &'static str {
        // `bot_community_summary` is a composite query which means it can't (currently) be called in
        // replicated mode, so canisters must call `bot_community_summary_c2c` instead which is an update
        // call.
        if is_canister_runtime {
            "bot_community_summary_c2c"
        } else {
            "bot_community_summary"
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Args {
    pub community_id: CommunityId,
}

#[expect(clippy::large_enum_variant)]
#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(CommunitySummary),
    Error(OCError),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CommunitySummary {
    pub community_id: CommunityId,
    pub last_updated: TimestampMillis,
    pub name: String,
    pub description: String,
    pub avatar_id: Option<u128>,
    pub banner_id: Option<u128>,
    #[serde(default, skip_serializing_if = "is_default")]
    pub is_public: bool,
    #[serde(default, skip_serializing_if = "is_default")]
    pub verified: bool,
    pub member_count: u32,
    pub permissions: CommunityPermissions,
    pub public_channels: Vec<ChannelSummary>,
    #[serde(default, skip_serializing_if = "is_default")]
    pub rules: VersionedRules,
    pub frozen: Option<FrozenGroupInfo>,
    pub gate_config: Option<AccessGateConfig>,
    pub primary_language: String,
    pub latest_event_index: EventIndex,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChannelSummary {
    pub channel_id: ChannelId,
    pub last_updated: TimestampMillis,
    pub name: String,
}
