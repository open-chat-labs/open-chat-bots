use super::ActionDef;
use crate::types::{
    BotChatContext, ChatEvent, EventIndex, EventWrapper, MessageIndex, OCError, TimestampMillis,
};
use serde::{Deserialize, Serialize};

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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    pub thread: Option<MessageIndex>,
    pub events: EventsSelectionCriteria,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(EventsResponse),
    Error(OCError),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EventsResponse {
    pub events: Vec<EventWrapper<ChatEvent>>,
    pub unauthorized: Vec<EventIndex>,
    pub expired_event_ranges: Vec<(EventIndex, EventIndex)>,
    pub expired_message_ranges: Vec<(MessageIndex, MessageIndex)>,
    pub latest_event_index: EventIndex,
    pub chat_last_updated: TimestampMillis,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum EventsSelectionCriteria {
    Page(EventsPageArgs),
    ByIndex(EventsByIndexArgs),
    Window(EventsWindowArgs),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EventsPageArgs {
    pub start_index: EventIndex,
    pub ascending: bool,
    pub max_messages: u32,
    pub max_events: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EventsByIndexArgs {
    pub events: Vec<EventIndex>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EventsWindowArgs {
    pub mid_point: MessageIndex,
    pub max_messages: u32,
    pub max_events: u32,
}
