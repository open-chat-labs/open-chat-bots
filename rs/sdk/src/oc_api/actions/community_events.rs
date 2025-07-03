use std::collections::HashMap;

use candid::{CandidType, Deserialize};
use serde::Serialize;

use crate::{
    api::command::Command,
    types::{
        AvatarChanged, BotAdded, BotRemoved, BotUpdated, ChannelId, ChatId, CommunityEventType,
        CommunityId, CommunityPermissions, CommunityRole, DescriptionChanged, EventIndex,
        EventWrapper, GateUpdated, InviteCodeChanged, MemberLeft, NameChanged, OCError,
        RulesChanged, TimestampMillis, UserId, UsersInvited,
    },
};

use super::ActionDef;

pub struct CommunityEventsAction;

impl ActionDef for CommunityEventsAction {
    type Args = Args;
    type Response = Response;

    fn method_name(is_canister_runtime: bool) -> &'static str {
        // `bot_community_events` is a composite query which means it can't (currently) be called in
        // replicated mode, so canisters must call `bot_community_events_c2c` instead which is an update
        // call.
        if is_canister_runtime {
            "bot_community_events_c2c"
        } else {
            "bot_community_events"
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub community_id: CommunityId,
    pub events: EventsSelectionCriteria,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum Response {
    Success(EventsResponse),
    Error(OCError),
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct EventsResponse {
    pub events: Vec<EventWrapper<CommunityEvent>>,
    pub latest_event_index: EventIndex,
    pub community_last_updated: TimestampMillis,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub enum EventsSelectionCriteria {
    Page(EventsPageArgs),
    ByIndex(EventsByIndexArgs),
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct EventsPageArgs {
    pub start_index: EventIndex,
    pub ascending: bool,
    pub max_events: u32,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Clone)]
pub struct EventsByIndexArgs {
    pub events: Vec<EventIndex>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum CommunityEvent {
    Created(Box<CommunityCreated>),
    NameChanged(Box<NameChanged>),
    DescriptionChanged(Box<DescriptionChanged>),
    RulesChanged(Box<RulesChanged>),
    AvatarChanged(Box<AvatarChanged>),
    BannerChanged(Box<BannerChanged>),
    UsersInvited(Box<UsersInvited>),
    MemberJoined(Box<CommunityMemberJoined>),
    MemberLeft(Box<MemberLeft>),
    MembersRemoved(Box<CommunityMembersRemoved>),
    RoleChanged(Box<CommunityRoleChanged>),
    UsersBlocked(Box<CommunityUsersBlocked>),
    UsersUnblocked(Box<CommunityUsersUnblocked>),
    PermissionsChanged(Box<CommunityPermissionsChanged>),
    VisibilityChanged(Box<CommunityVisibilityChanged>),
    InviteCodeChanged(Box<InviteCodeChanged>),
    Frozen(Box<CommunityFrozen>),
    Unfrozen(Box<CommunityUnfrozen>),
    GateUpdated(Box<GateUpdated>),
    ChannelCreated(Box<ChannelCreated>),
    ChannelDeleted(Box<ChannelDeleted>),
    PrimaryLanguageChanged(Box<PrimaryLanguageChanged>),
    GroupImported(Box<GroupImported>),
    BotAdded(Box<BotAdded>),
    BotRemoved(Box<BotRemoved>),
    BotUpdated(Box<BotUpdated>),
    FailedToDeserialize,
}

impl CommunityEvent {
    pub fn event_type(&self) -> Option<CommunityEventType> {
        match self {
            CommunityEvent::Created(_) => Some(CommunityEventType::Created),
            CommunityEvent::NameChanged(_) => Some(CommunityEventType::NameChanged),
            CommunityEvent::DescriptionChanged(_) => Some(CommunityEventType::DescriptionChanged),
            CommunityEvent::RulesChanged(_) => Some(CommunityEventType::RulesChanged),
            CommunityEvent::AvatarChanged(_) => Some(CommunityEventType::AvatarChanged),
            CommunityEvent::BannerChanged(_) => Some(CommunityEventType::BannerChanged),
            CommunityEvent::UsersInvited(_) => Some(CommunityEventType::UsersInvited),
            CommunityEvent::MemberJoined(_) => Some(CommunityEventType::MemberJoined),
            CommunityEvent::MemberLeft(_) => Some(CommunityEventType::MemberLeft),
            CommunityEvent::MembersRemoved(_) => Some(CommunityEventType::MembersRemoved),
            CommunityEvent::RoleChanged(_) => Some(CommunityEventType::RoleChanged),
            CommunityEvent::UsersBlocked(_) => Some(CommunityEventType::UsersBlocked),
            CommunityEvent::UsersUnblocked(_) => Some(CommunityEventType::UsersUnblocked),
            CommunityEvent::PermissionsChanged(_) => Some(CommunityEventType::PermissionsChanged),
            CommunityEvent::VisibilityChanged(_) => Some(CommunityEventType::VisibilityChanged),
            CommunityEvent::InviteCodeChanged(_) => None,
            CommunityEvent::Frozen(_) => Some(CommunityEventType::Frozen),
            CommunityEvent::Unfrozen(_) => Some(CommunityEventType::Unfrozen),
            CommunityEvent::GateUpdated(_) => Some(CommunityEventType::GateUpdated),
            CommunityEvent::ChannelCreated(_) => Some(CommunityEventType::ChannelCreated),
            CommunityEvent::ChannelDeleted(_) => Some(CommunityEventType::ChannelDeleted),
            CommunityEvent::PrimaryLanguageChanged(_) => {
                Some(CommunityEventType::PrimaryLanguageChanged)
            }
            CommunityEvent::GroupImported(_) => Some(CommunityEventType::GroupImported),
            CommunityEvent::BotAdded(_) => Some(CommunityEventType::BotAdded),
            CommunityEvent::BotRemoved(_) => Some(CommunityEventType::BotRemoved),
            CommunityEvent::BotUpdated(_) => Some(CommunityEventType::BotUpdated),
            CommunityEvent::FailedToDeserialize => None,
        }
    }

    pub fn initiated_by(&self) -> Option<UserId> {
        match self {
            CommunityEvent::Created(event) => Some(event.created_by),
            CommunityEvent::NameChanged(event) => Some(event.changed_by),
            CommunityEvent::DescriptionChanged(event) => Some(event.changed_by),
            CommunityEvent::RulesChanged(event) => Some(event.changed_by),
            CommunityEvent::AvatarChanged(event) => Some(event.changed_by),
            CommunityEvent::BannerChanged(event) => Some(event.changed_by),
            CommunityEvent::UsersInvited(event) => Some(event.invited_by),
            CommunityEvent::MemberJoined(event) => event.invited_by,
            CommunityEvent::MemberLeft(_) => None,
            CommunityEvent::MembersRemoved(event) => Some(event.removed_by),
            CommunityEvent::RoleChanged(event) => Some(event.changed_by),
            CommunityEvent::UsersBlocked(event) => Some(event.blocked_by),
            CommunityEvent::UsersUnblocked(event) => Some(event.unblocked_by),
            CommunityEvent::PermissionsChanged(event) => Some(event.changed_by),
            CommunityEvent::VisibilityChanged(event) => Some(event.changed_by),
            CommunityEvent::InviteCodeChanged(event) => Some(event.changed_by),
            CommunityEvent::Frozen(event) => Some(event.frozen_by),
            CommunityEvent::Unfrozen(event) => Some(event.unfrozen_by),
            CommunityEvent::GateUpdated(event) => Some(event.updated_by),
            CommunityEvent::ChannelCreated(event) => Some(event.created_by),
            CommunityEvent::ChannelDeleted(event) => Some(event.deleted_by),
            CommunityEvent::PrimaryLanguageChanged(event) => Some(event.changed_by),
            CommunityEvent::GroupImported(_) => None,
            CommunityEvent::BotAdded(event) => Some(event.added_by),
            CommunityEvent::BotRemoved(event) => Some(event.removed_by),
            CommunityEvent::BotUpdated(event) => Some(event.updated_by),
            CommunityEvent::FailedToDeserialize => None,
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityCreated {
    pub name: String,
    pub description: String,
    pub created_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BannerChanged {
    pub new_banner: Option<u128>,
    pub previous_banner: Option<u128>,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityMembersRemoved {
    pub user_ids: Vec<UserId>,
    pub removed_by: UserId,
    pub referred_by: HashMap<UserId, UserId>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityMemberJoined {
    pub user_id: UserId,
    pub channel_id: Option<ChannelId>,
    pub invited_by: Option<UserId>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityUsersBlocked {
    pub user_ids: Vec<UserId>,
    pub blocked_by: UserId,
    pub referred_by: HashMap<UserId, UserId>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityPermissionsChanged {
    pub old_permissions: CommunityPermissions,
    pub new_permissions: CommunityPermissions,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityVisibilityChanged {
    pub now_public: bool,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityRoleChanged {
    pub user_ids: Vec<UserId>,
    pub changed_by: UserId,
    pub old_role: CommunityRole,
    pub new_role: CommunityRole,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupImported {
    pub group_id: ChatId,
    pub channel_id: ChannelId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ChannelCreated {
    pub channel_id: ChannelId,
    pub is_public: bool,
    pub name: String,
    pub created_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ChannelDeleted {
    pub channel_id: ChannelId,
    pub name: String,
    pub deleted_by: UserId,
    pub bot_command: Option<Command>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct PrimaryLanguageChanged {
    pub previous: String,
    pub new: String,
    pub changed_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityFrozen {
    pub frozen_by: UserId,
    pub reason: Option<String>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityUnfrozen {
    pub unfrozen_by: UserId,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityUsersUnblocked {
    pub user_ids: Vec<UserId>,
    pub unblocked_by: UserId,
}
