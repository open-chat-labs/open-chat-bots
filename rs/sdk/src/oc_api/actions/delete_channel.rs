use crate::oc_api::actions::ActionDef;
use crate::types::{AuthToken, ChannelId};
use candid::CandidType;
use serde::{Deserialize, Serialize};

pub struct DeleteChannelAction;

impl ActionDef for DeleteChannelAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_delete_channel"
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub channel_id: ChannelId,
    pub auth_token: AuthToken,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum Response {
    Success,
    ChannelNotFound,
    FailedAuthentication(String),
    InvalidRequest(String),
    NotAuthorized,
    Frozen,
    C2CError(i32, String),
}
