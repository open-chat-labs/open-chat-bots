use crate::api::command::Command;

use super::{
    AccessGateConfig, BotPermissions, CanisterId, Chat, ChatPermissions, ChatRole, EventIndex,
    InstallationLocation, MessageContent, MessageId, MessageIndex, Milliseconds, TimestampMillis,
    UserId,
};
use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct EventWrapper<T> {
    pub index: EventIndex,
    pub timestamp: TimestampMillis,
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
    GroupNameChanged(NameChanged),
    GroupDescriptionChanged(DescriptionChanged),
    GroupRulesChanged(RulesChanged),
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
    GroupInviteCodeChanged(InviteCodeChanged),
    ChatFrozen(GroupFrozen),
    ChatUnfrozen(GroupUnfrozen),
    EventsTimeToLiveUpdated(EventsTimeToLiveUpdated),
    GroupGateUpdated(GateUpdated),
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
pub enum ChatEventCategory {
    Message = 0,    // Messages + edits, reaction, tips, etc.
    Membership = 1, // User added, blocked, invited, role changed, etc.
    Details = 2,    // Name, description, rules, permissions changed, etc.
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
pub struct NameChanged {
    pub new_name: String,
    pub previous_name: String,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct DescriptionChanged {
    pub new_description: String,
    pub previous_description: String,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct RulesChanged {
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
pub struct InviteCodeChanged {
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
pub struct GateUpdated {
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
    pub fn event_category(&self) -> Option<ChatEventCategory> {
        match self {
            ChatEvent::Message(_) => Some(ChatEventCategory::Message),
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
            | ChatEvent::ExternalUrlUpdated(_) => Some(ChatEventCategory::Details),
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
            | ChatEvent::BotUpdated(_) => Some(ChatEventCategory::Membership),
            ChatEvent::Empty | ChatEvent::FailedToDeserialize => None,
        }
    }
}

#[derive(
    CandidType, Serialize, Deserialize, Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord,
)]
#[repr(u8)]
pub enum CommunityEventCategory {
    Membership = 0, // User added, blocked, invited, role changed, etc.
    Details = 1,    // Name, description, rules, permissions changed, etc.
}

#[derive(
    CandidType, Serialize, Deserialize, Clone, Debug, Copy, Hash, PartialEq, Eq, PartialOrd, Ord,
)]
pub enum ChatEventType {
    // Message category
    Message,
    MessageEdited,
    MessageReaction,
    MessageTipped,
    MessageDeleted,
    MessageUndeleted,
    MessagePollVote,
    MessagePollEnded,
    MessagePrizeClaim,
    MessageP2pSwapCompleted,
    MessageP2pSwapCancelled,
    MessageVideoCall,

    // Details category
    NameChanged,
    DescriptionChanged,
    RulesChanged,
    AvatarChanged,
    ExternalUrlUpdated,
    PermissionsChanged,
    GateUpdated,
    VisibilityChanged,
    Frozen,   // Applies to group chats only
    Unfrozen, // Applies to group chats only
    DisappearingMessagesUpdated,
    MessagePinned,
    MessageUnpinned,

    // Membership category
    MembersJoined,
    MembersLeft,
    RoleChanged,
    UsersInvited,
    UsersBlocked,
    UsersUnblocked,
}

impl From<ChatEventType> for ChatEventCategory {
    fn from(value: ChatEventType) -> Self {
        match value {
            ChatEventType::Message
            | ChatEventType::MessageEdited
            | ChatEventType::MessageReaction
            | ChatEventType::MessageTipped
            | ChatEventType::MessageDeleted
            | ChatEventType::MessageUndeleted
            | ChatEventType::MessagePollVote
            | ChatEventType::MessagePollEnded
            | ChatEventType::MessagePrizeClaim
            | ChatEventType::MessageP2pSwapCompleted
            | ChatEventType::MessageP2pSwapCancelled
            | ChatEventType::MessageVideoCall => ChatEventCategory::Message,
            ChatEventType::NameChanged
            | ChatEventType::DescriptionChanged
            | ChatEventType::RulesChanged
            | ChatEventType::AvatarChanged
            | ChatEventType::ExternalUrlUpdated
            | ChatEventType::PermissionsChanged
            | ChatEventType::VisibilityChanged
            | ChatEventType::Frozen
            | ChatEventType::Unfrozen
            | ChatEventType::DisappearingMessagesUpdated
            | ChatEventType::GateUpdated
            | ChatEventType::MessagePinned
            | ChatEventType::MessageUnpinned => ChatEventCategory::Details,
            ChatEventType::MembersJoined
            | ChatEventType::MembersLeft
            | ChatEventType::RoleChanged
            | ChatEventType::UsersInvited
            | ChatEventType::UsersBlocked
            | ChatEventType::UsersUnblocked => ChatEventCategory::Membership,
        }
    }
}

#[derive(
    CandidType, Serialize, Deserialize, Clone, Debug, Copy, Hash, PartialEq, Eq, PartialOrd, Ord,
)]
pub enum CommunityEventType {
    // Details category
    Created,
    NameChanged,
    DescriptionChanged,
    RulesChanged,
    AvatarChanged,
    BannerChanged,
    PermissionsChanged,
    VisibilityChanged,
    Frozen,
    Unfrozen,
    EventsTTLUpdated,
    GateUpdated,
    MessagePinned,
    MessageUnpinned,
    PrimaryLanguageChanged,
    GroupImported,
    ChannelCreated,
    ChannelDeleted,

    // Membership category
    MembersJoined,
    MembersLeft,
    RoleChanged,
    UsersInvited,
    BotAdded,
    BotRemoved,
    BotUpdated,
    UsersBlocked,
    UsersUnblocked,
}

impl From<CommunityEventType> for CommunityEventCategory {
    fn from(value: CommunityEventType) -> Self {
        match value {
            CommunityEventType::Created
            | CommunityEventType::NameChanged
            | CommunityEventType::DescriptionChanged
            | CommunityEventType::RulesChanged
            | CommunityEventType::AvatarChanged
            | CommunityEventType::BannerChanged
            | CommunityEventType::PermissionsChanged
            | CommunityEventType::VisibilityChanged
            | CommunityEventType::Frozen
            | CommunityEventType::Unfrozen
            | CommunityEventType::EventsTTLUpdated
            | CommunityEventType::GateUpdated
            | CommunityEventType::PrimaryLanguageChanged
            | CommunityEventType::GroupImported
            | CommunityEventType::ChannelCreated
            | CommunityEventType::ChannelDeleted
            | CommunityEventType::MessagePinned
            | CommunityEventType::MessageUnpinned => CommunityEventCategory::Details,
            CommunityEventType::MembersJoined
            | CommunityEventType::MembersLeft
            | CommunityEventType::RoleChanged
            | CommunityEventType::UsersInvited
            | CommunityEventType::BotAdded
            | CommunityEventType::BotRemoved
            | CommunityEventType::BotUpdated
            | CommunityEventType::UsersBlocked
            | CommunityEventType::UsersUnblocked => CommunityEventCategory::Membership,
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotRegisteredEvent {
    #[serde(rename = "i")]
    pub bot_id: UserId,
    #[serde(rename = "n")]
    pub bot_name: String,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotInstalledEvent {
    #[serde(rename = "u")]
    pub installed_by: UserId,
    #[serde(rename = "l")]
    pub location: InstallationLocation,
    #[serde(rename = "p")]
    pub granted_command_permissions: BotPermissions,
    #[serde(rename = "a")]
    pub granted_autonomous_permissions: BotPermissions,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BotUninstalledEvent {
    #[serde(rename = "u")]
    pub uninstalled_by: UserId,
    #[serde(rename = "l")]
    pub location: InstallationLocation,
}
