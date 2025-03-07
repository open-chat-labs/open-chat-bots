use candid::{CandidType, Deserialize};
use serde::Serialize;

use crate::types::{
    AuthToken, ChannelId, ChatEvent, EventIndex, EventWrapper, MessageIndex, TimestampMillis,
};

use super::ActionDef;

pub struct ChatEventsAction;

impl ActionDef for ChatEventsAction {
    type Args = Args;
    type Response = Response;

    fn method_name(is_canister_runtime: bool) -> &'static str {
        if is_canister_runtime {
            "bot_chat_events_c2c"
        } else {
            "bot_chat_events"
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub channel_id: Option<ChannelId>,
    pub events: EventsSelectionCriteria,
    pub auth_token: AuthToken,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum Response {
    Success(EventsResponse),
    FailedAuthentication(String),
    NotAuthorized,
    NotFound,
    InternalError(String),
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct EventsResponse {
    pub events: Vec<EventWrapper<ChatEvent>>,
    pub unauthorized: Vec<EventIndex>,
    pub expired_event_ranges: Vec<(EventIndex, EventIndex)>,
    pub expired_message_ranges: Vec<(MessageIndex, MessageIndex)>,
    pub latest_event_index: EventIndex,
    pub chat_last_updated: TimestampMillis,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub enum EventsSelectionCriteria {
    Page(EventsPageArgs),
    ByIndex(EventsByIndexArgs),
    Window(EventsWindowArgs),
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct EventsPageArgs {
    pub start_index: EventIndex,
    pub ascending: bool,
    pub max_messages: u32,
    pub max_events: u32,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct EventsByIndexArgs {
    pub events: Vec<EventIndex>,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct EventsWindowArgs {
    pub mid_point: MessageIndex,
    pub max_messages: u32,
    pub max_events: u32,
}
