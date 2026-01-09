use crate::oc_api::actions::ActionDef;
use crate::types::{BotChatContext, ChannelId, UnitResult, UserId};
use candid::CandidType;
use serde::{Deserialize, Serialize};

pub struct InviteUsersAction;

impl ActionDef for InviteUsersAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_invite_users"
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    pub channel_id: Option<ChannelId>,
    pub user_ids: Vec<UserId>,
}

pub type Response = UnitResult;
