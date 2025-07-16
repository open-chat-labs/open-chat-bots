use super::ActionDef;
use crate::types::{BotCommunityOrGroupContext, ChannelId, OCError, TimestampMillis, UserId};
use candid::{CandidType, Deserialize};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use strum_macros::{EnumIter, EnumString};

pub struct MembersAction;

impl ActionDef for MembersAction {
    type Args = Args;
    type Response = Response;

    fn method_name(is_canister_runtime: bool) -> &'static str {
        // `bot_members` is a composite query which means it can't (currently) be called in
        // replicated mode, so canisters must call `bot_members_c2c` instead which is an update
        // call.
        if is_canister_runtime {
            "bot_members_c2c"
        } else {
            "bot_members"
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub community_or_group_context: BotCommunityOrGroupContext,
    pub channel_id: Option<ChannelId>,
    pub member_types: HashSet<MemberType>,
}

#[derive(
    CandidType,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Hash,
    EnumString,
    EnumIter,
)]
pub enum MemberType {
    Owner,
    Admin,
    Moderator,
    Member,
    Blocked,
    Invited,
    Lapsed,
    Bot,
    Webhook,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum Response {
    Success(MembersResult),
    Error(OCError),
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct MembersResult {
    pub members_map: HashMap<MemberType, Vec<UserId>>,
    pub timestamp: TimestampMillis,
}
