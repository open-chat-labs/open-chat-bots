use chrono::DateTime;
use ic_cdk_timers::TimerId;
use oc_bots_sdk::{
    oc_api::actions::{
        ActionArgsBuilder,
        community_events::{self, CommunityEvent, EventsPageArgs, EventsSelectionCriteria},
        create_channel, delete_channel, invite_users, send_message,
    },
    serialize_to_json,
    types::{
        ActionScope, AutonomousContext, CanisterId, ChannelId, Chat, ChatPermissionRole,
        ChatPermissions, CommunityId, CommunityRole, EventIndex, EventWrapper,
        GroupInviteCodeChange, MessagePermissions, OCErrorCode, TimestampMillis, UserId,
    },
};
use oc_bots_sdk_canister::{OPENCHAT_CLIENT_FACTORY, env};
use serde::{Deserialize, Serialize};
use std::{
    cell::Cell,
    collections::{BTreeMap, HashMap, HashSet},
    time::Duration,
};

use crate::state::{State, mutate};

thread_local! {
    static TIMER_ID: Cell<Option<TimerId>> = Cell::default();
}

pub(crate) fn start_job_if_required(state: &State) -> bool {
    if TIMER_ID.get().is_none()
        && let Some(next_action) = state.community_state_machine.next_action()
    {
        // Schedule the next action to run
        let timer_id = ic_cdk_timers::set_timer(
            Duration::from_millis(next_action.saturating_sub(env::now())),
            run,
        );
        TIMER_ID.set(Some(timer_id));
        return true;
    }

    false
}

fn run() {
    TIMER_ID.set(None);

    mutate(|state| {
        // Take up to 5 actions from the community state machine.
        for _ in 0..5 {
            if !state.community_state_machine.take_action() {
                return;
            }
        }

        // If there are still pending actions start the job again.
        start_job_if_required(state);
    });
}

#[derive(Serialize, Deserialize, Default, Debug)]
pub struct CommunityStateMachine {
    communities: HashMap<CommunityId, Community>,
}

impl CommunityStateMachine {
    pub fn add_community(&mut self, community_id: CommunityId, api_gateway: CanisterId) {
        self.communities
            .insert(community_id, Community::new(community_id, api_gateway));
    }

    pub fn handle_event(
        &mut self,
        community_id: CommunityId,
        timestamp: TimestampMillis,
        event_index: EventIndex,
        event: CommunityEvent,
    ) {
        if let Some(community) = self.communities.get_mut(&community_id) {
            community.handle_event(timestamp, event_index, event);
        }
    }

    pub fn remove_community(&mut self, community_id: CommunityId) {
        if let Some(mut community) = self.communities.remove(&community_id) {
            community.delete_channel(1);
        }
    }

    pub fn log_state(&self) {
        for community in self.communities.values() {
            community.log_state();
        }
    }

    fn next_action(&self) -> Option<TimestampMillis> {
        // Find the next action across all communities with the shortest delay.
        self.communities
            .values()
            .filter_map(|c| c.next_action())
            .min()
    }

    fn take_action(&mut self) -> bool {
        // Find the community with the next action and take it
        self.communities
            .values_mut()
            .filter_map(|c| c.next_action().map(|ts| (c, ts)))
            .min_by_key(|(_, ts)| *ts)
            .map(|(c, _)| c.take_action())
            .unwrap_or(false)
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct Community {
    community_id: CommunityId,
    api_gateway: CanisterId,
    admin_channel_id: Option<ChannelId>,
    events: BTreeMap<EventIndex, EventWrapper<CommunityEvent>>,
    users_to_invite: HashSet<UserId>,
    users_to_remove: HashSet<UserId>,
    state: CommunityState,
}

pub type RetryAttempt = u8;

#[derive(Serialize, Deserialize, Debug)]
enum CommunityState {
    Initial,
    Busy(Action),
    Failed(FailedState),
    ChannelCreated,
    MoreEventsToRead,
    AwaitingNewEvents,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
enum Action {
    CreateChannel,
    InviteOwners,
    RemoveUser,
    ReadEvents,
    SendMessage,
    DeleteChannel,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct FailedState {
    action: Action,
    attempts: RetryAttempt,
    next_attempt: Option<TimestampMillis>,
}

impl Community {
    fn new(community_id: CommunityId, api_gateway: CanisterId) -> Self {
        Community {
            community_id,
            api_gateway,
            admin_channel_id: None,
            events: BTreeMap::new(),
            state: CommunityState::Initial,
            users_to_invite: HashSet::new(),
            users_to_remove: HashSet::new(),
        }
    }

    fn log_state(&self) {
        ic_cdk::println!("{:?}", self.state);
    }

    fn handle_event(
        &mut self,
        timestamp: TimestampMillis,
        event_index: EventIndex,
        event: CommunityEvent,
    ) {
        if let CommunityEvent::RoleChanged(role_changed) = &event {
            if matches!(role_changed.new_role, CommunityRole::Owner) {
                // Invite the new owners to the admin channel
                self.users_to_remove
                    .retain(|user_id| !role_changed.user_ids.contains(user_id));
                self.users_to_invite.extend(role_changed.user_ids.clone());
            } else if matches!(role_changed.old_role, CommunityRole::Owner) {
                // Remove the old owners from the admin channel
                self.users_to_invite
                    .retain(|user_id| !role_changed.user_ids.contains(user_id));
                self.users_to_remove.extend(role_changed.user_ids.clone());
            }
        }

        self.events.insert(
            event_index,
            EventWrapper {
                index: event_index,
                timestamp,
                expires_at: None,
                event,
            },
        );
    }

    fn next_action(&self) -> Option<TimestampMillis> {
        // Check if the community is in a state that requires an action.
        match &self.state {
            CommunityState::Busy(_) => None,
            CommunityState::AwaitingNewEvents => (!self.events.is_empty()
                || !self.users_to_invite.is_empty()
                || !self.users_to_remove.is_empty())
            .then_some(env::now()),
            CommunityState::Failed(failed) => failed.next_attempt,
            _ => Some(env::now()),
        }
    }

    // Take action based on the current state of the community.
    fn take_action(&mut self) -> bool {
        match &self.state {
            CommunityState::Initial => {
                self.create_channel(1);
                true
            }
            CommunityState::Failed(failed) => {
                if let Some(next_attempt) = failed.next_attempt
                    && next_attempt <= env::now()
                {
                    let attempt = failed.attempts + 1;
                    match failed.action {
                        Action::CreateChannel => self.create_channel(attempt),
                        Action::InviteOwners => self.invite_owners(attempt),
                        Action::RemoveUser => self.remove_user(attempt),
                        Action::ReadEvents => self.read_events(attempt),
                        Action::SendMessage => self.send_message(attempt),
                        Action::DeleteChannel => self.delete_channel(attempt),
                    }
                    return true;
                }
                false
            }
            CommunityState::ChannelCreated => {
                self.read_events(1);
                true
            }
            CommunityState::MoreEventsToRead => {
                self.read_events(1);
                true
            }
            CommunityState::AwaitingNewEvents => {
                let next_event_is_role_changed =
                    self.events.first_key_value().is_some_and(|(_, event)| {
                        matches!(event.event, CommunityEvent::RoleChanged(_))
                    });

                if next_event_is_role_changed {
                    self.send_message(1);
                } else if !self.users_to_invite.is_empty() {
                    self.invite_owners(1);
                } else if !self.users_to_remove.is_empty() {
                    self.remove_user(1);
                } else if !self.events.is_empty() {
                    self.send_message(1);
                } else {
                    return false;
                }
                true
            }
            CommunityState::Busy(_) => false,
        }
    }

    fn create_channel(&mut self, attempt: u8) {
        self.state = CommunityState::Busy(Action::CreateChannel);

        ic_cdk::spawn(create_channel(self.api_gateway, self.community_id, attempt));
    }

    fn invite_owners(&mut self, attempt: u8) {
        if let Some(channel_id) = self.admin_channel_id {
            self.state = CommunityState::Busy(Action::InviteOwners);

            ic_cdk::spawn(invite_owners(
                self.api_gateway,
                self.community_id,
                channel_id,
                self.users_to_invite.drain().collect(),
                attempt,
            ));
        }
    }

    fn remove_user(&mut self, attempt: u8) {
        if let Some(channel_id) = self.admin_channel_id {
            // Remove the first user from the set of users to remove
            if let Some(user) = self.users_to_remove.iter().next().cloned() {
                self.state = CommunityState::Busy(Action::RemoveUser);
                self.users_to_remove.remove(&user);

                ic_cdk::spawn(remove_user(
                    self.api_gateway,
                    self.community_id,
                    channel_id,
                    user,
                    attempt,
                ));
            }
        }
    }

    fn read_events(&mut self, attempt: u8) {
        self.events.clear();
        self.state = CommunityState::Busy(Action::ReadEvents);

        ic_cdk::spawn(read_events(
            self.api_gateway,
            self.community_id,
            self.events
                .keys()
                .last()
                .map_or(EventIndex::default(), |&last_index| last_index + 1),
            attempt,
        ));
    }

    fn send_message(&mut self, attempt: u8) {
        if let Some(channel_id) = self.admin_channel_id
            && let Some(event) = self.events.first_key_value()
        {
            self.state = CommunityState::Busy(Action::SendMessage);

            ic_cdk::spawn(send_message(
                self.api_gateway,
                self.community_id,
                channel_id,
                event.1.clone(),
                attempt,
            ));
        }
    }

    fn delete_channel(&mut self, attempt: u8) {
        if let Some(channel_id) = self.admin_channel_id {
            self.state = CommunityState::Busy(Action::DeleteChannel);

            ic_cdk::spawn(delete_channel(
                self.api_gateway,
                self.community_id,
                channel_id,
                attempt,
            ));
        }
    }

    // Extract the community owners from the community events
    fn extract_owners(&self) -> HashSet<UserId> {
        let mut owners: HashSet<UserId> = HashSet::new();

        for event in self.events.values() {
            match &event.event {
                CommunityEvent::Created(event) => {
                    owners.insert(event.created_by);
                }
                CommunityEvent::RoleChanged(event) => {
                    if matches!(event.new_role, CommunityRole::Owner) {
                        owners.extend(event.user_ids.clone());
                    } else if matches!(event.old_role, CommunityRole::Owner) {
                        owners.retain(|user_id| !event.user_ids.contains(user_id));
                    }
                }
                CommunityEvent::MemberLeft(event) => {
                    owners.remove(&event.user_id);
                }
                CommunityEvent::MembersRemoved(event) => {
                    owners.retain(|user_id| !event.user_ids.contains(user_id));
                }
                _ => {}
            }
        }

        owners
    }
}

async fn create_channel(api_gateway: CanisterId, community_id: CommunityId, attempt: u8) {
    ic_cdk::println!("Creating channel: {}, attempt: {}", community_id, attempt);

    let context = AutonomousContext {
        scope: ActionScope::Community(community_id),
        api_gateway,
    };

    let permissions = ChatPermissions {
        change_roles: ChatPermissionRole::Owner,
        update_group: ChatPermissionRole::Owner,
        add_members: ChatPermissionRole::Owner,
        invite_users: ChatPermissionRole::Owner,
        remove_members: ChatPermissionRole::Owner,
        delete_messages: ChatPermissionRole::Owner,
        pin_messages: ChatPermissionRole::Members,
        react_to_messages: ChatPermissionRole::Members,
        mention_all_members: ChatPermissionRole::Owner,
        start_video_call: ChatPermissionRole::None,
        message_permissions: MessagePermissions {
            default: ChatPermissionRole::Owner,
            text: None,
            image: None,
            video: None,
            audio: None,
            file: None,
            poll: None,
            crypto: None,
            giphy: None,
            prize: None,
            p2p_swap: None,
            video_call: None,
            custom: vec![],
        },
        thread_permissions: Some(MessagePermissions {
            default: ChatPermissionRole::Members,
            text: None,
            image: None,
            video: None,
            audio: None,
            file: None,
            poll: None,
            crypto: None,
            giphy: None,
            prize: Some(ChatPermissionRole::None),
            p2p_swap: Some(ChatPermissionRole::None),
            video_call: Some(ChatPermissionRole::None),
            custom: vec![],
        }),
    };

    let (error_code, error_message) = match OPENCHAT_CLIENT_FACTORY
        .build(context)
        .create_channel("Community events".to_string(), false)
        .with_permissions(permissions)
        .execute_async()
        .await
    {
        Ok(create_channel::Response::Success(result)) => {
            mutate(|state| {
                if let Some(community) = state
                    .community_state_machine
                    .communities
                    .get_mut(&community_id)
                {
                    community.admin_channel_id = Some(result.channel_id);
                    community.state = CommunityState::ChannelCreated;

                    ic_cdk::println!("Channel created: {}", result.channel_id);

                    start_job_if_required(state);
                }
            });
            return;
        }
        Ok(create_channel::Response::Error(error)) => {
            (error.code().into(), error.message().map(|s| s.to_string()))
        }
        Err((_code, message)) => (OCErrorCode::C2CError, Some(message)),
    };

    handle_error(
        community_id,
        error_code,
        error_message,
        Action::CreateChannel,
        attempt,
    );
}

async fn read_events(
    api_gateway: CanisterId,
    community_id: CommunityId,
    start_index: EventIndex,
    attempt: u8,
) {
    ic_cdk::println!(
        "Reading events: {}, start_index: {}, attempt: {}",
        community_id,
        start_index,
        attempt
    );

    let context = AutonomousContext {
        scope: ActionScope::Community(community_id),
        api_gateway,
    };

    let criteria = EventsSelectionCriteria::Page(EventsPageArgs {
        start_index,
        ascending: true,
        max_events: 500,
    });

    let (error_code, error_message) = match OPENCHAT_CLIENT_FACTORY
        .build(context)
        .community_events(criteria)
        .execute_async()
        .await
    {
        Ok(community_events::Response::Success(result)) => {
            mutate(|state| {
                if let Some(community) = state
                    .community_state_machine
                    .communities
                    .get_mut(&community_id)
                {
                    let all_events_read = result
                        .events
                        .last()
                        .is_none_or(|e| e.index == result.latest_event_index);

                    for event in result.events {
                        community.events.insert(event.index, event);
                    }

                    community.state = if all_events_read {
                        community.users_to_invite = community.extract_owners();
                        community.users_to_remove = HashSet::new();
                        CommunityState::AwaitingNewEvents
                    } else {
                        CommunityState::MoreEventsToRead
                    };

                    ic_cdk::println!("Events read: {}", result.latest_event_index);

                    start_job_if_required(state);
                }
            });

            return;
        }
        Ok(community_events::Response::Error(error)) => {
            (error.code().into(), error.message().map(|s| s.to_string()))
        }
        Err((_code, message)) => (OCErrorCode::C2CError, Some(message)),
    };

    handle_error(
        community_id,
        error_code,
        error_message,
        Action::ReadEvents,
        attempt,
    );
}

async fn invite_owners(
    api_gateway: CanisterId,
    community_id: CommunityId,
    channel_id: ChannelId,
    owners: Vec<UserId>,
    attempt: u8,
) {
    ic_cdk::println!(
        "Inviting users to channel: {}, users: {:?}, attempt: {}",
        community_id,
        owners,
        attempt
    );

    let context = AutonomousContext {
        scope: ActionScope::Community(community_id),
        api_gateway,
    };

    let (error_code, error_message) = match OPENCHAT_CLIENT_FACTORY
        .build(context)
        .invite_users(owners.clone())
        .with_channel_id(channel_id)
        .execute_async()
        .await
    {
        Ok(invite_users::Response::Success) => {
            mutate(|state| {
                if let Some(community) = state
                    .community_state_machine
                    .communities
                    .get_mut(&community_id)
                {
                    community.state = CommunityState::AwaitingNewEvents;

                    ic_cdk::println!("Users invited: {:?}", owners);

                    start_job_if_required(state);
                }
            });
            return;
        }
        Ok(invite_users::Response::Error(error)) => {
            (error.code().into(), error.message().map(|s| s.to_string()))
        }
        Err((_code, message)) => (OCErrorCode::C2CError, Some(message)),
    };

    mutate(|state| {
        if let Some(community) = state
            .community_state_machine
            .communities
            .get_mut(&community_id)
        {
            community.users_to_invite.extend(owners);
        }
    });

    handle_error(
        community_id,
        error_code,
        error_message,
        Action::InviteOwners,
        attempt,
    );
}

async fn remove_user(
    api_gateway: CanisterId,
    community_id: CommunityId,
    channel_id: ChannelId,
    user: UserId,
    attempt: u8,
) {
    ic_cdk::println!(
        "Removing user from channel: {}, user: {:?}, attempt: {}",
        community_id,
        user,
        attempt
    );

    let context = AutonomousContext {
        scope: ActionScope::Community(community_id),
        api_gateway,
    };

    let (error_code, error_message) = match OPENCHAT_CLIENT_FACTORY
        .build(context)
        .remove_user(user)
        .from_channel_id(channel_id)
        .execute_async()
        .await
    {
        Ok(invite_users::Response::Success) => {
            mutate(|state| {
                if let Some(community) = state
                    .community_state_machine
                    .communities
                    .get_mut(&community_id)
                {
                    community.state = CommunityState::AwaitingNewEvents;

                    ic_cdk::println!("User removed: {:?}", user);

                    start_job_if_required(state);
                }
            });
            return;
        }
        Ok(invite_users::Response::Error(error)) => {
            (error.code().into(), error.message().map(|s| s.to_string()))
        }
        Err((_code, message)) => (OCErrorCode::C2CError, Some(message)),
    };

    mutate(|state| {
        if let Some(community) = state
            .community_state_machine
            .communities
            .get_mut(&community_id)
        {
            community.users_to_remove.insert(user);
        }
    });

    handle_error(
        community_id,
        error_code,
        error_message,
        Action::RemoveUser,
        attempt,
    );
}

async fn send_message(
    api_gateway: CanisterId,
    community_id: CommunityId,
    channel_id: ChannelId,
    wrapped_event: EventWrapper<CommunityEvent>,
    attempt: u8,
) {
    ic_cdk::println!(
        "Sending message: {}, event: {}, attempt: {}",
        community_id,
        wrapped_event.index,
        attempt
    );

    let context = AutonomousContext {
        scope: ActionScope::Chat(Chat::Channel(community_id, channel_id)),
        api_gateway,
    };

    let (text, block_level_markdown) = message_from_event(wrapped_event, community_id);

    let (error_code, error_message) = match OPENCHAT_CLIENT_FACTORY
        .build(context)
        .send_text_message(text.clone())
        .with_block_level_markdown(block_level_markdown)
        .execute_async()
        .await
    {
        Ok(send_message::Response::Success(_)) => {
            mutate(|state| {
                if let Some(community) = state
                    .community_state_machine
                    .communities
                    .get_mut(&community_id)
                {
                    community.events.pop_first();
                    community.state = CommunityState::AwaitingNewEvents;
                    start_job_if_required(state);
                }
            });
            return;
        }
        Ok(send_message::Response::Error(error)) => {
            ic_cdk::println!("{}", text);

            (error.code().into(), error.message().map(|s| s.to_string()))
        }
        Err((_code, message)) => (OCErrorCode::C2CError, Some(message)),
    };

    handle_error(
        community_id,
        error_code,
        error_message,
        Action::SendMessage,
        attempt,
    );
}

async fn delete_channel(
    api_gateway: CanisterId,
    community_id: CommunityId,
    channel_id: ChannelId,
    attempt: u8,
) {
    ic_cdk::println!("Deleting channel: {}", channel_id);

    let context = AutonomousContext {
        scope: ActionScope::Community(community_id),
        api_gateway,
    };

    let (error_code, error_message) = match OPENCHAT_CLIENT_FACTORY
        .build(context)
        .delete_channel(channel_id)
        .execute_async()
        .await
    {
        Ok(delete_channel::Response::Success) => return,
        Ok(delete_channel::Response::Error(error)) => {
            (error.code().into(), error.message().map(|s| s.to_string()))
        }
        Err((_code, message)) => (OCErrorCode::C2CError, Some(message)),
    };

    handle_error(
        community_id,
        error_code,
        error_message,
        Action::DeleteChannel,
        attempt,
    );
}

fn message_from_event(
    wrapper: EventWrapper<CommunityEvent>,
    community_id: CommunityId,
) -> (String, bool) {
    let timestamp = DateTime::from_timestamp_millis(wrapper.timestamp as i64)
        .unwrap()
        .format("%Y-%m-%d %H:%M")
        .to_string();

    let initiated_by = wrapper
        .event
        .initiated_by()
        .map(|user_id| format!(" by @UserId({user_id})"))
        .unwrap_or_default();

    let mut block_level_markdown = false;

    let (event_type, second_line) = match wrapper.event {
        CommunityEvent::Created(event) => (
            format!("Community \"{}\", created", event.name),
            Some(event.description),
        ),
        CommunityEvent::NameChanged(event) => (
            format!("Community name changed to \"{}\"", event.new_name),
            None,
        ),
        CommunityEvent::DescriptionChanged(event) => (
            "Description changed".to_string(),
            Some(event.new_description),
        ),
        CommunityEvent::RulesChanged(event) => (
            "Rules changed".to_string(),
            Some(format!("enabled: \"{}\"", event.enabled)),
        ),
        CommunityEvent::AvatarChanged(event) => {
            if let Some(new_avatar) = event.new_avatar {
                (
                    "Avatar changed".to_string(),
                    Some(format!(
                        "![new avatar](http://{community_id}.raw.localhost:8080/avatar/{new_avatar})"
                    )),
                )
            } else {
                ("Avatar removed".to_string(), None)
            }
        }
        CommunityEvent::BannerChanged(event) => {
            if let Some(new_banner) = event.new_banner {
                (
                    "Banner changed".to_string(),
                    Some(format!(
                        "![new banner](http://{community_id}.raw.localhost:8080/banner/{new_banner})"
                    )),
                )
            } else {
                ("Banner removed".to_string(), None)
            }
        }
        CommunityEvent::UsersInvited(event) => {
            if event.user_ids.len() == 1 {
                (format!("@UserId({}) was invited", event.user_ids[0]), None)
            } else {
                (
                    "Users invited".to_string(),
                    Some(format_user_ids(&event.user_ids)),
                )
            }
        }
        CommunityEvent::MemberJoined(event) => (format!("@UserId({}) joined", event.user_id), None),
        CommunityEvent::MemberLeft(event) => (format!("@UserId({}) left", event.user_id), None),
        CommunityEvent::MembersRemoved(event) => {
            if event.user_ids.len() == 1 {
                (format!("@UserId({}) was removed", event.user_ids[0]), None)
            } else {
                (
                    "Users removed".to_string(),
                    Some(format_user_ids(&event.user_ids)),
                )
            }
        }
        CommunityEvent::RoleChanged(event) => {
            if event.user_ids.len() == 1 {
                (
                    format!(
                        "Role changed for @UserId({}) from {:?} to {:?}",
                        event.user_ids[0], event.old_role, event.new_role
                    ),
                    None,
                )
            } else {
                (
                    format!(
                        "Role changed from {:?} to {:?}",
                        event.old_role, event.new_role
                    ),
                    Some(format!("for users {}", format_user_ids(&event.user_ids))),
                )
            }
        }
        CommunityEvent::UsersBlocked(event) => {
            if event.user_ids.len() == 1 {
                (format!("@UserId({}) was blocked", event.user_ids[0]), None)
            } else {
                (
                    "Users blocked".to_string(),
                    Some(format_user_ids(&event.user_ids)),
                )
            }
        }
        CommunityEvent::UsersUnblocked(event) => {
            if event.user_ids.len() == 1 {
                (
                    format!("@UserId({}) was unblocked", event.user_ids[0]),
                    None,
                )
            } else {
                (
                    "Users unblocked".to_string(),
                    Some(format_user_ids(&event.user_ids)),
                )
            }
        }
        CommunityEvent::VisibilityChanged(event) => (
            format!(
                "Visibility changed to {:?}",
                if event.now_public {
                    "public"
                } else {
                    "private"
                }
            ),
            None,
        ),
        CommunityEvent::InviteCodeChanged(event) => {
            let result = match event.change {
                GroupInviteCodeChange::Enabled => "enabled",
                GroupInviteCodeChange::Disabled => "disabled",
                GroupInviteCodeChange::Reset => "reset",
            };
            (format!("Invite code {}", result), None)
        }
        CommunityEvent::Frozen(event) => ("Community frozen".to_string(), event.reason),
        CommunityEvent::Unfrozen(_) => ("Community unfrozen".to_string(), None),
        CommunityEvent::GateUpdated(event) => {
            if let Some(gate_config) = event.new_gate_config {
                block_level_markdown = true;
                let json = serialize_to_json(&gate_config).unwrap_or_default();
                (
                    "Gate updated".to_string(),
                    Some(format!("```\n{json}\n```")),
                )
            } else {
                ("Gate removed".to_string(), None)
            }
        }
        CommunityEvent::PermissionsChanged(event) => {
            block_level_markdown = true;
            let json = serialize_to_json(&event.new_permissions).unwrap_or_default();
            (
                "Permissions changed".to_string(),
                Some(format!("```\n{json}\n```")),
            )
        }
        CommunityEvent::ChannelCreated(event) => (
            format!(
                "Channel [{}](/community/{}/channel/{}), created",
                event.name, community_id, event.channel_id
            ),
            None,
        ),
        CommunityEvent::ChannelDeleted(event) => (
            format!("Channel with id {}, deleted", event.channel_id),
            None,
        ),
        CommunityEvent::PrimaryLanguageChanged(event) => (
            format!(
                "Primary language changed from \"{}\" to \"{}\"",
                event.previous, event.new
            ),
            None,
        ),
        CommunityEvent::GroupImported(event) => (
            format!(
                "Group with id {} imported into [channel](/community/{}/channel/{})",
                event.group_id, community_id, event.channel_id
            ),
            None,
        ),
        CommunityEvent::BotAdded(event) => (format!("Bot @UserId({}), added", event.user_id), None),
        CommunityEvent::BotRemoved(event) => {
            (format!("Bot @UserId({}), removed", event.user_id), None)
        }
        CommunityEvent::BotUpdated(event) => {
            (format!("Bot @UserId({}), updated", event.user_id), None)
        }
        CommunityEvent::FailedToDeserialize => (
            "Unknown event".to_string(),
            Some("Failed to deserialize event".to_string()),
        ),
    };

    let first_line = format!(
        "{}{}. {} - {}{}",
        wrapper.index,
        if block_level_markdown { "&#8291;" } else { "" },
        timestamp,
        event_type,
        initiated_by
    );

    let text = if let Some(second_line) = second_line {
        format!("{}\n\n{}", first_line, second_line)
    } else {
        first_line
    };

    (text, block_level_markdown)
}

fn format_user_ids(user_ids: &[UserId]) -> String {
    if user_ids.is_empty() {
        return "no users".to_string();
    }
    user_ids
        .iter()
        .map(|user_id| format!("@UserId({})", user_id))
        .collect::<Vec<_>>()
        .join(", ")
}

fn set_failed_state(
    action: Action,
    error_code: OCErrorCode,
    attempt: u8,
    now: TimestampMillis,
) -> FailedState {
    let next_attempt = if error_code != OCErrorCode::C2CError {
        None
    } else {
        let duration = match attempt {
            1 => Some(Duration::from_secs(1)),
            2 => Some(Duration::from_secs(4)),
            3 => Some(Duration::from_secs(16)),
            4 => Some(Duration::from_secs(64)),
            5 => Some(Duration::from_secs(256)),
            _ => None,
        };

        duration.map(|d| now.checked_add(d.as_millis() as u64).unwrap_or(now))
    };

    FailedState {
        action,
        attempts: attempt,
        next_attempt,
    }
}

fn handle_error(
    community_id: CommunityId,
    error_code: OCErrorCode,
    error_message: Option<String>,
    action: Action,
    attempt: u8,
) {
    ic_cdk::println!(
        "Failed to {:?}, attempt: {}, community: {}, error: {:?} {:?}",
        action,
        attempt,
        community_id,
        error_code,
        error_message
    );

    let new_state =
        CommunityState::Failed(set_failed_state(action, error_code, attempt, env::now()));

    mutate(|state| {
        if let Some(community) = state
            .community_state_machine
            .communities
            .get_mut(&community_id)
        {
            community.state = new_state;
            start_job_if_required(state);
        }
    });
}
