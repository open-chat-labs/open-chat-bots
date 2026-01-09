use crate::types::{BotCommunityOrGroupContext, ChannelId, UnitResult};
use crate::{oc_api::actions::ActionDef, types::UserId};
use serde::{Deserialize, Serialize};

pub struct RemoveUserAction;

impl ActionDef for RemoveUserAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_remove_user"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub community_or_group_context: BotCommunityOrGroupContext,
    pub channel_id: Option<ChannelId>,
    pub user_id: UserId,
    pub block: bool,
}

pub type Response = UnitResult;
