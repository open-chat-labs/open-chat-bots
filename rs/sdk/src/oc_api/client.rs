use crate::oc_api::Runtime;
use crate::oc_api::actions::chat_events::EventsSelectionCriteria as ChatEventsSelectionCriteria;
use crate::oc_api::actions::community_events::EventsSelectionCriteria as CommunityEventsSelectionCriteria;
use crate::oc_api::actions::members::MemberType;
use crate::oc_api::client::members::MembersBuilder;
use crate::oc_api::client::remove_user::RemoveUserBuilder;
use crate::types::{
    ActionContext, AutonomousContext, BridgedUserId, CanisterId, ChannelId, ChatRole,
    MessageContentInitial, MessageId, MiniAppUpdate, Reaction, TextContent, UserId,
};
use add_reaction::AddReactionBuilder;
#[cfg(feature = "bridge")]
use bridged_user_links::{LinkBridgedUserBuilder, UnlinkBridgedUserBuilder};
use bridged_users::BridgedUsersBuilder;
use change_role::ChangeRoleBuilder;
use chat_events::ChatEventsBuilder;
use chat_summary::ChatSummaryBuilder;
use community_events::CommunityEventsBuilder;
use community_summary::CommunitySummaryBuilder;
use create_channel::CreateChannelBuilder;
use delete_channel::DeleteChannelBuilder;
use delete_messages::DeleteMessagesBuilder;
use edit_message::EditMessageBuilder;
use installation_events::InstallationEventsBuilder;
use invite_users::InviteUsersBuilder;
use send_message::SendMessageBuilder;
use std::collections::HashSet;
use std::sync::Arc;
use update_mini_app::UpdateMiniAppBuilder;
pub use upload::UploadError;

mod add_reaction;
#[cfg(feature = "bridge")]
mod bridged_user_links;
mod bridged_users;
mod change_role;
mod chat_events;
mod chat_summary;
mod community_events;
mod community_summary;
mod create_channel;
mod delete_channel;
mod delete_messages;
mod edit_message;
mod installation_events;
mod invite_users;
mod members;
mod remove_user;
mod send_message;
mod update_mini_app;
mod upload;

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
    ) -> AddReactionBuilder<'_, R, C> {
        AddReactionBuilder::new(self, message_id, reaction)
    }

    pub fn change_role(
        &self,
        user_ids: Vec<UserId>,
        new_role: ChatRole,
    ) -> ChangeRoleBuilder<'_, R, C> {
        ChangeRoleBuilder::new(self, user_ids, new_role)
    }

    pub fn chat_summary(&self) -> ChatSummaryBuilder<'_, R, C> {
        ChatSummaryBuilder::new(self)
    }

    pub fn chat_events(&self, events: ChatEventsSelectionCriteria) -> ChatEventsBuilder<'_, R, C> {
        ChatEventsBuilder::new(self, events)
    }

    pub fn community_summary(&self) -> CommunitySummaryBuilder<'_, R, C> {
        CommunitySummaryBuilder::new(self)
    }

    pub fn community_events(
        &self,
        events: CommunityEventsSelectionCriteria,
    ) -> CommunityEventsBuilder<'_, R, C> {
        CommunityEventsBuilder::new(self, events)
    }

    pub fn create_channel(&self, name: String, is_public: bool) -> CreateChannelBuilder<'_, R, C> {
        CreateChannelBuilder::new(self, name, is_public)
    }

    pub fn delete_channel(&self, channel_id: ChannelId) -> DeleteChannelBuilder<'_, R, C> {
        DeleteChannelBuilder::new(self, channel_id)
    }

    pub fn delete_messages(&self, message_ids: Vec<MessageId>) -> DeleteMessagesBuilder<'_, R, C> {
        DeleteMessagesBuilder::new(self, message_ids)
    }

    pub fn invite_users(&self, user_ids: Vec<UserId>) -> InviteUsersBuilder<'_, R, C> {
        InviteUsersBuilder::new(self, user_ids)
    }

    pub fn members(&self, member_types: HashSet<MemberType>) -> MembersBuilder<'_, R, C> {
        MembersBuilder::new(self, member_types)
    }

    pub fn remove_user(&self, user_id: UserId) -> RemoveUserBuilder<'_, R, C> {
        RemoveUserBuilder::new(self, user_id)
    }

    pub fn send_message(&self, content: MessageContentInitial) -> SendMessageBuilder<'_, R, C> {
        SendMessageBuilder::new(self, content)
    }

    pub fn send_text_message(&self, text: String) -> SendMessageBuilder<'_, R, C> {
        self.send_message(MessageContentInitial::Text(TextContent { text }))
    }

    /// Changes what the bot's MiniApp card, `message_id`, shows as its game goes on: its status,
    /// players, whose move it is and the result. It works with a command's context or
    /// autonomously, eg. with a `BotMessageSession`'s `autonomous_context()`, and needs no permission
    /// beyond the bot being installed. A card in a thread needs `in_thread`, unless the context is
    /// a command's in that thread.
    pub fn update_mini_app(
        &self,
        message_id: MessageId,
        update: MiniAppUpdate,
    ) -> UpdateMiniAppBuilder<'_, R, C> {
        UpdateMiniAppBuilder::new(self, message_id, update)
    }
}

// A bot edits its messages autonomously, as OpenChat refuses an edit made with a command's context
impl<R: Runtime> Client<R, AutonomousContext> {
    /// Edits one of the bot's own messages, in a group or channel, eg. for a bridge bot to relay an
    /// edit made on the other platform. The bot needs the autonomous permission to send the new
    /// content's type, eg. `MessagePermission::Text`. The new content must be the same type as the
    /// old, a poll can't be edited, and nor can a deleted message.
    pub fn edit_message(
        &self,
        message_id: MessageId,
        content: MessageContentInitial,
    ) -> EditMessageBuilder<'_, R, AutonomousContext> {
        EditMessageBuilder::new(self, message_id, content)
    }
}

// Calls to the UserIndex, whose id is the client's context, eg. `mainnet::mainnet_user_index_canister_id()`
impl<R: Runtime> Client<R, CanisterId> {
    pub fn installation_events(&self) -> InstallationEventsBuilder<'_, R> {
        InstallationEventsBuilder::new(self)
    }

    /// The latest profiles of accounts on other platforms which bridge bots have relayed messages
    /// from, at most `MAX_BRIDGED_USERS` at a time, eg. to show who wrote a relayed message
    pub fn bridged_users(&self, users: Vec<BridgedUserId>) -> BridgedUsersBuilder<'_, R> {
        BridgedUsersBuilder::new(self, users)
    }

    #[cfg(feature = "bridge")]
    pub fn link_bridged_user(
        &self,
        user: crate::types::BridgedUser,
        code: String,
    ) -> LinkBridgedUserBuilder<'_, R> {
        LinkBridgedUserBuilder::new(self, user, code)
    }

    #[cfg(feature = "bridge")]
    pub fn unlink_bridged_user(&self, user: BridgedUserId) -> UnlinkBridgedUserBuilder<'_, R> {
        UnlinkBridgedUserBuilder::new(self, user)
    }
}
