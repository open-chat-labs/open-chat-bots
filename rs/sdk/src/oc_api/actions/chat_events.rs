use super::ActionDef;
use crate::types::{BotChatContext, EventIndex, EventsResponse, MessageIndex, OCError};
use candid::{CandidType, Deserialize};
use serde::Serialize;

pub struct ChatEventsAction;

impl ActionDef for ChatEventsAction {
    type Args = Args;
    type Response = Response;

    fn method_name(is_canister_runtime: bool) -> &'static str {
        // `bot_chat_events` is a composite query which means it can't (currently) be called in
        // replicated mode, so canisters must call `bot_chat_events_c2c` instead which is an update
        // call.
        if is_canister_runtime {
            "bot_chat_events_c2c"
        } else {
            "bot_chat_events"
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    pub thread: Option<MessageIndex>,
    pub events: EventsSelectionCriteria,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum Response {
    Success(EventsResponse),
    Error(OCError),
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
