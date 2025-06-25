use crate::oc_api::actions::chat_events::EventsSelectionCriteria as ChatEventsSelectionCriteria;
use crate::oc_api::actions::community_events::EventsSelectionCriteria as CommunityEventsSelectionCriteria;
use crate::oc_api::actions::members::MemberType;
use crate::oc_api::client::members::MembersBuilder;
use crate::oc_api::client::remove_user::RemoveUserBuilder;
use crate::oc_api::Runtime;
use crate::types::{
    ActionContext, ChannelId, ChatEventType, CommunityEventType, MessageContentInitial, MessageId,
    Reaction, TextContent, UserId,
};
use add_reaction::AddReactionBuilder;
use chat_events::ChatEventsBuilder;
use chat_summary::ChatSummaryBuilder;
use community_events::CommunityEventsBuilder;
use community_summary::CommunitySummaryBuilder;
use create_channel::CreateChannelBuilder;
use delete_channel::DeleteChannelBuilder;
use delete_messages::DeleteMessagesBuilder;
use invite_users::InviteUsersBuilder;
use send_message::SendMessageBuilder;
use std::collections::HashSet;
use std::sync::Arc;
use subscribe_to_chat_events::SubscribeToChatEventsBuilder;
use unsubscribe_from_chat_events::UnsubscribeFromChatEventsBuilder;

mod add_reaction;
mod chat_events;
mod chat_summary;
mod community_events;
mod community_summary;
mod create_channel;
mod delete_channel;
mod delete_messages;
mod invite_users;
mod members;
mod remove_user;
mod send_message;
mod subscribe_to_chat_events;
mod unsubscribe_from_chat_events;

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
    pub fn add_reaction(
        &self,
        message_id: MessageId,
        reaction: Reaction,
    ) -> AddReactionBuilder<R, C> {
        AddReactionBuilder::new(self, message_id, reaction)
    }

    pub fn chat_summary(&self) -> ChatSummaryBuilder<R, C> {
        ChatSummaryBuilder::new(self)
    }

    pub fn chat_events(&self, events: ChatEventsSelectionCriteria) -> ChatEventsBuilder<R, C> {
        ChatEventsBuilder::new(self, events)
    }

    pub fn community_summary(&self) -> CommunitySummaryBuilder<R, C> {
        CommunitySummaryBuilder::new(self)
    }

    pub fn community_events(
        &self,
        events: CommunityEventsSelectionCriteria,
    ) -> CommunityEventsBuilder<R, C> {
        CommunityEventsBuilder::new(self, events)
    }

    pub fn create_channel(&self, name: String, is_public: bool) -> CreateChannelBuilder<R, C> {
        CreateChannelBuilder::new(self, name, is_public)
    }

    pub fn delete_channel(&self, channel_id: ChannelId) -> DeleteChannelBuilder<R, C> {
        DeleteChannelBuilder::new(self, channel_id)
    }

    pub fn delete_messages(&self, message_ids: Vec<MessageId>) -> DeleteMessagesBuilder<R, C> {
        DeleteMessagesBuilder::new(self, message_ids)
    }

    pub fn invite_users(&self, user_ids: Vec<UserId>) -> InviteUsersBuilder<R, C> {
        InviteUsersBuilder::new(self, user_ids)
    }

    pub fn members(&self, member_types: HashSet<MemberType>) -> MembersBuilder<R, C> {
        MembersBuilder::new(self, member_types)
    }

    pub fn remove_user(&self, user_id: UserId) -> RemoveUserBuilder<R, C> {
        RemoveUserBuilder::new(self, user_id)
    }

    pub fn send_message(&self, content: MessageContentInitial) -> SendMessageBuilder<R, C> {
        SendMessageBuilder::new(self, content)
    }

    pub fn send_text_message(&self, text: String) -> SendMessageBuilder<R, C> {
        self.send_message(MessageContentInitial::Text(TextContent { text }))
    }

    pub fn subscribe_to_chat_events(
        &self,
        chat_events: HashSet<ChatEventType>,
        community_events: HashSet<CommunityEventType>,
    ) -> SubscribeToChatEventsBuilder<R, C> {
        SubscribeToChatEventsBuilder::new(self, chat_events, community_events)
    }

    pub fn unsubscribe_from_chat_events(&self) -> UnsubscribeFromChatEventsBuilder<R, C> {
        UnsubscribeFromChatEventsBuilder::new(self)
    }
}
