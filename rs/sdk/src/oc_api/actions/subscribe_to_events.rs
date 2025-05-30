use super::ActionDef;
use crate::types::{ActionScope, ChatEventType, CommunityEventType, UnitResult};
use candid::{CandidType, Deserialize};
use serde::Serialize;
use std::collections::HashSet;

pub struct SubscribeToChatEventsAction;

impl ActionDef for SubscribeToChatEventsAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_subscribe_to_events"
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub scope: ActionScope,
    pub community_events: HashSet<CommunityEventType>,
    pub chat_events: HashSet<ChatEventType>,
}

pub type Response = UnitResult;
