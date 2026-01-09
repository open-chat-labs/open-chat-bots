use crate::oc_api::actions::ActionDef;
use crate::types::{ChannelId, CommunityId, UnitResult};
use serde::{Deserialize, Serialize};

pub struct DeleteChannelAction;

impl ActionDef for DeleteChannelAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_delete_channel"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub community_id: CommunityId,
    pub channel_id: ChannelId,
}

pub type Response = UnitResult;
