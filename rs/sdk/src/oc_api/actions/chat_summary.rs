use super::ActionDef;
use crate::types::{
    AccessGateConfig, BotChatContext, ChatPermissions, EventIndex, FrozenGroupInfo, MessageIndex,
    Milliseconds, OCError, TimestampMillis, VersionedRules, VideoCall,
};
use serde::{Deserialize, Serialize};

pub struct ChatSummaryAction;

impl ActionDef for ChatSummaryAction {
    type Args = Args;
    type Response = Response;

    fn method_name(is_canister_runtime: bool) -> &'static str {
        // `bot_chat_summary` is a composite query which means it can't (currently) be called in
        // replicated mode, so canisters must call `bot_chat_summary_c2c` instead which is an update
        // call.
        if is_canister_runtime {
            "bot_chat_summary_c2c"
        } else {
            "bot_chat_summary"
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Args {
    pub chat_context: BotChatContext,
}

#[expect(clippy::large_enum_variant)]
#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(ChatSummary),
    Error(OCError),
}

#[expect(clippy::large_enum_variant)]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum ChatSummary {
    Group(ChatSummaryGroup),
    Direct(ChatSummaryDirect),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatSummaryGroup {
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatSummaryDirect {
    pub last_updated: TimestampMillis,
    pub latest_event_index: EventIndex,
    pub latest_message_index: Option<MessageIndex>,
    pub events_ttl: Option<Milliseconds>,
    pub events_ttl_last_updated: Option<TimestampMillis>,
    pub video_call_in_progress: Option<VideoCall>,
}
