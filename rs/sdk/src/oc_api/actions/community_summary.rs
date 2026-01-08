use super::ActionDef;
use crate::types::{
    AccessGateConfig, ChannelId, CommunityId, CommunityPermissions, EventIndex, FrozenGroupInfo,
    OCError, TimestampMillis, VersionedRules,
};
use candid::{CandidType, Deserialize};
use serde::Serialize;

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

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct Args {
    pub community_id: CommunityId,
}

#[expect(clippy::large_enum_variant)]
#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum Response {
    Success(CommunitySummary),
    Error(OCError),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunitySummary {
    pub community_id: CommunityId,
    pub last_updated: TimestampMillis,
    pub name: String,
    pub description: String,
    pub avatar_id: Option<u128>,
    pub banner_id: Option<u128>,
    pub is_public: Option<bool>,
    pub verified: Option<bool>,
    pub member_count: u32,
    pub permissions: CommunityPermissions,
    pub public_channels: Vec<ChannelSummary>,
    pub rules: Option<VersionedRules>,
    pub frozen: Option<FrozenGroupInfo>,
    pub gate_config: Option<AccessGateConfig>,
    pub primary_language: String,
    pub latest_event_index: EventIndex,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ChannelSummary {
    pub channel_id: ChannelId,
    pub last_updated: TimestampMillis,
    pub name: String,
}
