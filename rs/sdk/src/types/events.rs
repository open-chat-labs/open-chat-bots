use crate::api::command::Command;

use super::{
    AccessGateConfig, CanisterId, Chat, ChatPermissions, ChatRole, EventIndex, MessageContent,
    MessageId, MessageIndex, Milliseconds, TimestampMillis, UserId,
};
use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct EventWrapper<T> {
    pub index: EventIndex,
    pub timestamp: TimestampMillis,
    pub correlation_id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<TimestampMillis>,
    pub event: T,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum ChatEvent {
    Empty,
    Message(Box<Message>),
    GroupChatCreated(GroupCreated),
    DirectChatCreated(DirectChatCreated),
    GroupNameChanged(GroupNameChanged),
    GroupDescriptionChanged(GroupDescriptionChanged),
    GroupRulesChanged(GroupRulesChanged),
    AvatarChanged(AvatarChanged),
    ParticipantsAdded(MembersAdded),
    ParticipantsRemoved(MembersRemoved),
    ParticipantJoined(MemberJoined),
    ParticipantLeft(MemberLeft),
    RoleChanged(RoleChanged),
    UsersBlocked(UsersBlocked),
    UsersUnblocked(UsersUnblocked),
    MessagePinned(MessagePinned),
    MessageUnpinned(MessageUnpinned),
    PermissionsChanged(PermissionsChanged),
    GroupVisibilityChanged(GroupVisibilityChanged),
    GroupInviteCodeChanged(GroupInviteCodeChanged),
    ChatFrozen(GroupFrozen),
    ChatUnfrozen(GroupUnfrozen),
    EventsTimeToLiveUpdated(EventsTimeToLiveUpdated),
    GroupGateUpdated(GroupGateUpdated),
    UsersInvited(UsersInvited),
    MembersAddedToDefaultChannel(MembersAddedToDefaultChannel),
    ExternalUrlUpdated(ExternalUrlUpdated),
    BotAdded(BotAdded),
    BotRemoved(BotRemoved),
    BotUpdated(BotUpdated),
    FailedToDeserialize,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Message {
    pub message_index: MessageIndex,
    pub message_id: MessageId,
    pub sender: UserId,
    pub content: MessageContent,
    pub bot_context: Option<BotMessageContext>,
    pub replies_to: Option<ReplyContext>,
    pub reactions: Vec<(String, Vec<UserId>)>,
    pub tips: Tips,
    pub thread_summary: Option<ThreadSummary>,
    pub edited: bool,
    pub forwarded: bool,
    pub block_level_markdown: bool,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ReplyContext {
    pub chat_if_other: Option<(Chat, Option<MessageIndex>)>,
    pub event_index: EventIndex,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ThreadSummary {
    pub participant_ids: Vec<UserId>,
    pub followed_by_me: bool,
    pub reply_count: u32,
    pub latest_event_index: EventIndex,
    pub latest_event_timestamp: TimestampMillis,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Default)]
pub struct Tips(Vec<(CanisterId, Vec<(UserId, u128)>)>);

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotMessageContext {
    pub command: Option<Command>,
    pub finalised: bool,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone, Copy, Hash, PartialEq, Eq)]
#[repr(u8)]
pub enum ChatEventType {
    Message = 0,           // Messages + edits, reaction, tips, etc.
    MembershipUpdate = 1,  // User added, blocked, invited, role changed, etc.
    ChatDetailsUpdate = 2, // Name, description, rules, permissions changed, etc.
}

type Events = Vec<EventWrapper<ChatEvent>>;
type ExpiredEventRanges = Vec<(EventIndex, EventIndex)>;
type Unauthorized = Vec<EventIndex>;

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct EventsResponse {
    pub events: Events,
    pub unauthorized: Unauthorized,
    pub expired_event_ranges: ExpiredEventRanges,
    pub expired_message_ranges: Vec<(MessageIndex, MessageIndex)>,
    pub latest_event_index: EventIndex,
    pub chat_last_updated: TimestampMillis,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct MessagesResponse {
    pub messages: Vec<EventWrapper<Message>>,
    pub latest_event_index: EventIndex,
    pub chat_last_updated: TimestampMillis,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupCreated {
    pub name: String,
    pub description: String,
    pub created_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupNameChanged {
    pub new_name: String,
    pub previous_name: String,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupDescriptionChanged {
    pub new_description: String,
    pub previous_description: String,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupRulesChanged {
    pub enabled: bool,
    pub prev_enabled: bool,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct AvatarChanged {
    pub new_avatar: Option<u128>,
    pub previous_avatar: Option<u128>,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BannerChanged {
    pub new_banner: Option<u128>,
    pub previous_banner: Option<u128>,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct MembersAdded {
    pub user_ids: Vec<UserId>,
    pub added_by: UserId,
    pub unblocked: Vec<UserId>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct MembersRemoved {
    pub user_ids: Vec<UserId>,
    pub removed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct UsersBlocked {
    pub user_ids: Vec<UserId>,
    pub blocked_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct UsersUnblocked {
    pub user_ids: Vec<UserId>,
    pub unblocked_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct MemberJoined {
    pub user_id: UserId,
    pub invited_by: Option<UserId>,
}

// The aliases need to be kept to handle pre-existing values
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MemberJoinedInternal {
    #[serde(rename = "u", alias = "user_id")]
    pub user_id: UserId,
    #[serde(
        rename = "i",
        alias = "invited_by",
        skip_serializing_if = "Option::is_none"
    )]
    pub invited_by: Option<UserId>,
}

impl From<MemberJoined> for MemberJoinedInternal {
    fn from(value: MemberJoined) -> Self {
        MemberJoinedInternal {
            user_id: value.user_id,
            invited_by: value.invited_by,
        }
    }
}

impl From<MemberJoinedInternal> for MemberJoined {
    fn from(value: MemberJoinedInternal) -> Self {
        MemberJoined {
            user_id: value.user_id,
            invited_by: value.invited_by,
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct MemberLeft {
    pub user_id: UserId,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CommunityMemberLeftInternal {
    #[serde(rename = "u", alias = "user_id")]
    pub user_id: UserId,
    #[serde(
        rename = "r",
        alias = "referred_by",
        skip_serializing_if = "Option::is_none"
    )]
    pub referred_by: Option<UserId>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct RoleChanged {
    pub user_ids: Vec<UserId>,
    pub changed_by: UserId,
    pub old_role: ChatRole,
    pub new_role: ChatRole,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct MessagePinned {
    pub message_index: MessageIndex,
    pub pinned_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct MessageUnpinned {
    pub message_index: MessageIndex,
    pub unpinned_by: UserId,
    pub due_to_message_deleted: bool,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct PermissionsChanged {
    pub old_permissions_v2: ChatPermissions,
    pub new_permissions_v2: ChatPermissions,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupVisibilityChanged {
    pub public: Option<bool>,
    pub messages_visible_to_non_members: Option<bool>,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupInviteCodeChanged {
    pub change: GroupInviteCodeChange,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum GroupInviteCodeChange {
    Enabled,
    Disabled,
    Reset,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupFrozen {
    pub frozen_by: UserId,
    pub reason: Option<String>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupUnfrozen {
    pub unfrozen_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct EventsTimeToLiveUpdated {
    pub updated_by: UserId,
    pub new_ttl: Option<Milliseconds>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupGateUpdated {
    pub updated_by: UserId,
    pub new_gate_config: Option<AccessGateConfig>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct MembersAddedToDefaultChannel {
    pub count: u32,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ExternalUrlUpdated {
    pub updated_by: UserId,
    pub new_url: Option<String>,
}

#[derive(CandidType, Serialize, Deserialize, Copy, Clone, Debug)]
pub struct DirectChatCreated {}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct UsersInvited {
    pub user_ids: Vec<UserId>,
    pub invited_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotAdded {
    pub user_id: UserId,
    pub added_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotRemoved {
    pub user_id: UserId,
    pub removed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotUpdated {
    pub user_id: UserId,
    pub updated_by: UserId,
}

impl ChatEvent {
    pub fn event_type(&self) -> Option<ChatEventType> {
        match self {
            ChatEvent::Message(_) => Some(ChatEventType::Message),
            ChatEvent::GroupChatCreated(_)
            | ChatEvent::DirectChatCreated(_)
            | ChatEvent::GroupNameChanged(_)
            | ChatEvent::GroupDescriptionChanged(_)
            | ChatEvent::GroupRulesChanged(_)
            | ChatEvent::AvatarChanged(_)
            | ChatEvent::MessagePinned(_)
            | ChatEvent::MessageUnpinned(_)
            | ChatEvent::PermissionsChanged(_)
            | ChatEvent::GroupVisibilityChanged(_)
            | ChatEvent::GroupInviteCodeChanged(_)
            | ChatEvent::ChatFrozen(_)
            | ChatEvent::ChatUnfrozen(_)
            | ChatEvent::EventsTimeToLiveUpdated(_)
            | ChatEvent::GroupGateUpdated(_)
            | ChatEvent::ExternalUrlUpdated(_) => Some(ChatEventType::ChatDetailsUpdate),
            ChatEvent::ParticipantsAdded(_)
            | ChatEvent::ParticipantsRemoved(_)
            | ChatEvent::ParticipantJoined(_)
            | ChatEvent::ParticipantLeft(_)
            | ChatEvent::RoleChanged(_)
            | ChatEvent::UsersBlocked(_)
            | ChatEvent::UsersUnblocked(_)
            | ChatEvent::UsersInvited(_)
            | ChatEvent::MembersAddedToDefaultChannel(_)
            | ChatEvent::BotAdded(_)
            | ChatEvent::BotRemoved(_)
            | ChatEvent::BotUpdated(_) => Some(ChatEventType::MembershipUpdate),
            ChatEvent::Empty | ChatEvent::FailedToDeserialize => None,
        }
    }
}
