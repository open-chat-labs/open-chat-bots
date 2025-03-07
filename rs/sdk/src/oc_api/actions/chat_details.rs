use candid::{CandidType, Deserialize};
use serde::Serialize;

use crate::types::{
    AccessGateConfig, AuthToken, ChannelId, ChatPermissions, EventIndex, FrozenGroupInfo,
    MessageIndex, Milliseconds, TimestampMillis, VersionedRules, VideoCall,
};

use super::ActionDef;

pub struct ChatDetailsAction;

impl ActionDef for ChatDetailsAction {
    type Args = Args;
    type Response = Response;

    fn method_name(is_canister_runtime: bool) -> &'static str {
        if is_canister_runtime {
            "bot_chat_details_c2c"
        } else {
            "bot_chat_details"
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct Args {
    pub channel_id: Option<ChannelId>,
    pub auth_token: AuthToken,
}

#[allow(clippy::large_enum_variant)]
#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum Response {
    Success(ChatDetails),
    FailedAuthentication(String),
    DirectChatUnsupported,
    NotAuthorized,
    NotFound,
    InternalError(String),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ChatDetails {
    pub name: String,
    pub description: String,
    pub avatar_id: Option<u128>,
    pub is_public: bool,
    pub history_visible_to_new_joiners: bool,
    pub messages_visible_to_non_members: bool,
    pub permissions: ChatPermissions,
    pub rules: VersionedRules,
    pub events_ttl: Option<Milliseconds>,
    pub events_ttl_last_updated: Option<TimestampMillis>,
    pub gate_config: Option<AccessGateConfig>,
    pub video_call_in_progress: Option<VideoCall>,
    pub verified: Option<bool>,
    pub frozen: Option<FrozenGroupInfo>,
    pub date_last_pinned: Option<TimestampMillis>,
    pub last_updated: TimestampMillis,
    pub external_url: Option<String>,
    pub latest_event_index: EventIndex,
    pub latest_message_index: Option<MessageIndex>,
    pub member_count: u32,
}
