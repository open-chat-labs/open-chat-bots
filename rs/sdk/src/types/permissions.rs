use candid::CandidType;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::hash::Hash;

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Default)]
pub struct BotPermissions {
    pub community: HashSet<CommunityPermission>,
    pub chat: HashSet<ChatPermission>,
    pub message: HashSet<MessagePermission>,
}

impl BotPermissions {
    pub fn is_empty(&self) -> bool {
        self.community.is_empty() && self.chat.is_empty() && self.message.is_empty()
    }

    pub fn is_subset(&self, other: &Self) -> bool {
        self.community.is_subset(&other.community)
            && self.chat.is_subset(&other.chat)
            && self.message.is_subset(&other.message)
    }

    pub fn intersect(p1: &Self, p2: &Self) -> Self {
        fn intersect<T: Hash + Eq + Clone>(x: &HashSet<T>, y: &HashSet<T>) -> HashSet<T> {
            x.intersection(y).cloned().collect()
        }

        Self {
            community: intersect(&p1.community, &p2.community),
            chat: intersect(&p1.chat, &p2.chat),
            message: intersect(&p1.message, &p2.message),
        }
    }

    pub fn union(p1: &Self, p2: &Self) -> Self {
        fn union<T: Hash + Eq + Clone>(x: &HashSet<T>, y: &HashSet<T>) -> HashSet<T> {
            x.union(y).cloned().collect()
        }

        Self {
            community: union(&p1.community, &p2.community),
            chat: union(&p1.chat, &p2.chat),
            message: union(&p1.message, &p2.message),
        }
    }

    pub fn text_only() -> Self {
        Self::from_message_permission(MessagePermission::Text)
    }

    pub fn from_message_permission(permission: MessagePermission) -> Self {
        Self {
            message: HashSet::from_iter([permission]),
            ..Default::default()
        }
    }
}

#[repr(u8)]
#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CommunityPermission {
    ChangeRoles = 0,
    UpdateDetails = 1,
    InviteUsers = 2,
    RemoveMembers = 3,
    CreatePublicChannel = 4,
    CreatePrivateChannel = 5,
    ManageUserGroups = 6,
}

#[repr(u8)]
#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ChatPermission {
    ChangeRoles = 0,
    UpdateGroup = 1,
    AddMembers = 2,
    InviteUsers = 3,
    RemoveMembers = 4,
    DeleteMessages = 5,
    PinMessages = 6,
    ReactToMessages = 7,
    MentionAllMembers = 8,
    StartVideoCall = 9,
}

#[repr(u8)]
#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum MessagePermission {
    Text = 0,
    Image = 1,
    Video = 2,
    Audio = 3,
    File = 4,
    Poll = 5,
    Crypto = 6,
    Giphy = 7,
    Prize = 8,
    P2pSwap = 9,
    VideoCall = 10,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ChatPermissions {
    pub change_roles: ChatPermissionRole,
    pub update_group: ChatPermissionRole,
    pub add_members: ChatPermissionRole,
    pub invite_users: ChatPermissionRole,
    pub remove_members: ChatPermissionRole,
    pub delete_messages: ChatPermissionRole,
    pub pin_messages: ChatPermissionRole,
    pub react_to_messages: ChatPermissionRole,
    pub mention_all_members: ChatPermissionRole,
    pub start_video_call: ChatPermissionRole,
    pub message_permissions: MessagePermissions,
    pub thread_permissions: Option<MessagePermissions>,
}

#[derive(CandidType, Serialize, Deserialize, Copy, Clone, Debug, Eq, PartialEq)]
pub enum ChatPermissionRole {
    None,
    Owner,
    Admins,
    Moderators,
    Members,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct MessagePermissions {
    pub default: ChatPermissionRole,
    pub text: Option<ChatPermissionRole>,
    pub image: Option<ChatPermissionRole>,
    pub video: Option<ChatPermissionRole>,
    pub audio: Option<ChatPermissionRole>,
    pub file: Option<ChatPermissionRole>,
    pub poll: Option<ChatPermissionRole>,
    pub crypto: Option<ChatPermissionRole>,
    pub giphy: Option<ChatPermissionRole>,
    pub prize: Option<ChatPermissionRole>,
    pub p2p_swap: Option<ChatPermissionRole>,
    pub video_call: Option<ChatPermissionRole>,
    pub custom: Vec<CustomPermission>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CustomPermission {
    pub subtype: String,
    pub role: ChatPermissionRole,
}

#[derive(CandidType, Serialize, Deserialize, Copy, Clone, Debug, Default)]
pub enum ChatRole {
    Owner,
    Admin,
    Moderator,
    #[default]
    Participant,
}
