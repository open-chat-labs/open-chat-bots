use crate::oc_api::actions::chat_events::EventsSelectionCriteria;
use crate::oc_api::Runtime;
use crate::types::{ActionContext, ChannelId, MessageContentInitial, TextContent};
use chat_details::ChatDetailsBuilder;
use chat_events::ChatEventsBuilder;
use create_channel::CreateChannelBuilder;
use delete_channel::DeleteChannelBuilder;
use send_message::SendMessageBuilder;
use std::sync::Arc;

mod chat_details;
mod chat_events;
mod create_channel;
mod delete_channel;
mod send_message;

pub struct Client<R> {
    runtime: Arc<R>,
    context: ActionContext,
}

impl<R: Runtime> Client<R> {
    pub fn new(runtime: Arc<R>, context: ActionContext) -> Self {
        Client { runtime, context }
    }

    pub fn send_message(self, content: MessageContentInitial) -> SendMessageBuilder<R> {
        SendMessageBuilder::new(self, content)
    }

    pub fn send_text_message(self, text: String) -> SendMessageBuilder<R> {
        self.send_message(MessageContentInitial::Text(TextContent { text }))
    }

    pub fn create_channel(self, name: String, is_public: bool) -> CreateChannelBuilder<R> {
        CreateChannelBuilder::new(self, name, is_public)
    }

    pub fn delete_channel(self, channel_id: ChannelId) -> DeleteChannelBuilder<R> {
        DeleteChannelBuilder::new(self, channel_id)
    }

    pub fn chat_details(self) -> ChatDetailsBuilder<R> {
        ChatDetailsBuilder::new(self)
    }

    pub fn chat_events(self, events: EventsSelectionCriteria) -> ChatEventsBuilder<R> {
        ChatEventsBuilder::new(self, events)
    }
}
