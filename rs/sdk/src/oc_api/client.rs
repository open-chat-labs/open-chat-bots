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

pub struct ClientFactory<R> {
    runtime: Arc<R>,
}

impl<R: Runtime> ClientFactory<R> {
    pub fn new(runtime: R) -> Self {
        Self {
            runtime: Arc::new(runtime),
        }
    }

    pub fn build<C>(&self, context: C) -> Client<R, C> {
        Client::new(self.runtime.clone(), context)
    }
}

pub struct Client<R, C> {
    runtime: Arc<R>,
    context: C,
}

impl<R, C> Client<R, C> {
    pub fn new(runtime: Arc<R>, context: C) -> Self {
        Client { runtime, context }
    }

    pub fn context(&self) -> &C {
        &self.context
    }
}

impl<R: Runtime, C: ActionContext> Client<R, C> {
    pub fn send_message(&self, content: MessageContentInitial) -> SendMessageBuilder<R, C> {
        SendMessageBuilder::new(self, content)
    }

    pub fn send_text_message(&self, text: String) -> SendMessageBuilder<R, C> {
        self.send_message(MessageContentInitial::Text(TextContent { text }))
    }

    pub fn create_channel(&self, name: String, is_public: bool) -> CreateChannelBuilder<R, C> {
        CreateChannelBuilder::new(self, name, is_public)
    }

    pub fn delete_channel(&self, channel_id: ChannelId) -> DeleteChannelBuilder<R, C> {
        DeleteChannelBuilder::new(self, channel_id)
    }

    pub fn chat_details(&self) -> ChatDetailsBuilder<R, C> {
        ChatDetailsBuilder::new(self)
    }

    pub fn chat_events(&self, events: EventsSelectionCriteria) -> ChatEventsBuilder<R, C> {
        ChatEventsBuilder::new(self, events)
    }
}
