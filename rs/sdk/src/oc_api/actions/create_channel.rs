use crate::oc_api::actions::ActionDef;
use crate::types::{
    AccessGateConfig, ChannelId, ChatPermissions, CommunityId, Document, Milliseconds, OCError,
    Rules,
};
use candid::CandidType;
use serde::{Deserialize, Serialize};

pub struct CreateChannelAction;

impl ActionDef for CreateChannelAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_create_channel"
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub community_id: CommunityId,
    pub is_public: bool,
    pub name: String,
    pub description: String,
    pub rules: Rules,
    pub avatar: Option<Document>,
    pub history_visible_to_new_joiners: bool,
    pub messages_visible_to_non_members: bool,
    pub permissions: Option<ChatPermissions>,
    pub events_ttl: Option<Milliseconds>,
    pub gate_config: Option<AccessGateConfig>,
    pub external_url: Option<String>,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum Response {
    Success(SuccessResult),
    Error(OCError),
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct SuccessResult {
    pub channel_id: ChannelId,
}
