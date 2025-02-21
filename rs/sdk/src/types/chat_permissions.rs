use candid::CandidType;
use serde::{Deserialize, Serialize};

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
