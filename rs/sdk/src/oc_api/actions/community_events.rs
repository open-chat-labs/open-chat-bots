use std::collections::HashMap;

use candid::{CandidType, Deserialize};
use serde::Serialize;

use crate::{
    api::command::Command,
    types::{
        AvatarChanged, BannerChanged, BotAdded, BotRemoved, BotUpdated, ChannelId, ChatId,
        CommunityEventType, CommunityId, CommunityPermissions, CommunityRole, EventIndex,
        EventWrapper, GroupCreated, GroupDescriptionChanged, GroupFrozen, GroupGateUpdated,
        GroupInviteCodeChanged, GroupNameChanged, GroupRulesChanged, GroupUnfrozen, OCError,
        TimestampMillis, UserId, UsersInvited, UsersUnblocked,
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
    Created(Box<GroupCreated>),
    NameChanged(Box<GroupNameChanged>),
    DescriptionChanged(Box<GroupDescriptionChanged>),
    RulesChanged(Box<GroupRulesChanged>),
    AvatarChanged(Box<AvatarChanged>),
    BannerChanged(Box<BannerChanged>),
    UsersInvited(Box<UsersInvited>),
    MembersRemoved(Box<CommunityMembersRemoved>),
    RoleChanged(Box<CommunityRoleChanged>),
    UsersBlocked(Box<CommunityUsersBlocked>),
    UsersUnblocked(Box<UsersUnblocked>),
    PermissionsChanged(Box<CommunityPermissionsChanged>),
    VisibilityChanged(Box<CommunityVisibilityChanged>),
    InviteCodeChanged(Box<GroupInviteCodeChanged>),
    Frozen(Box<GroupFrozen>),
    Unfrozen(Box<GroupUnfrozen>),
    GateUpdated(Box<GroupGateUpdated>),
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
            CommunityEvent::MembersRemoved(_) => Some(CommunityEventType::MembersLeft),
            CommunityEvent::RoleChanged(_) => Some(CommunityEventType::RoleChanged),
            CommunityEvent::UsersBlocked(_) => Some(CommunityEventType::UsersBlocked),
            CommunityEvent::UsersUnblocked(_) => Some(CommunityEventType::UsersUnblocked),
            CommunityEvent::PermissionsChanged(_) => Some(CommunityEventType::PermissionsChanged),
            CommunityEvent::VisibilityChanged(_) => Some(CommunityEventType::VisibilityChanged),
            CommunityEvent::InviteCodeChanged(_) => Some(CommunityEventType::InviteCodeChanged),
            CommunityEvent::Frozen(_) => Some(CommunityEventType::Frozen),
            CommunityEvent::Unfrozen(_) => Some(CommunityEventType::Unfrozen),
            CommunityEvent::GateUpdated(_) => Some(CommunityEventType::GateUpdated),
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
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CommunityMembersRemoved {
    pub user_ids: Vec<UserId>,
    pub removed_by: UserId,
    pub referred_by: HashMap<UserId, UserId>,
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
