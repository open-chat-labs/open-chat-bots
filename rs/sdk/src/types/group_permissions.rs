use candid::CandidType;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GroupPermissions {
    pub change_roles: GroupPermissionRole,
    pub update_group: GroupPermissionRole,
    pub add_members: GroupPermissionRole,
    pub invite_users: GroupPermissionRole,
    pub remove_members: GroupPermissionRole,
    pub delete_messages: GroupPermissionRole,
    pub pin_messages: GroupPermissionRole,
    pub react_to_messages: GroupPermissionRole,
    pub mention_all_members: GroupPermissionRole,
    pub start_video_call: GroupPermissionRole,
    pub message_permissions: MessagePermissions,
    pub thread_permissions: Option<MessagePermissions>,
}

#[derive(CandidType, Serialize, Deserialize, Copy, Clone, Debug, Eq, PartialEq)]
pub enum GroupPermissionRole {
    None,
    Owner,
    Admins,
    Moderators,
    Members,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct MessagePermissions {
    pub default: GroupPermissionRole,
    pub text: Option<GroupPermissionRole>,
    pub image: Option<GroupPermissionRole>,
    pub video: Option<GroupPermissionRole>,
    pub audio: Option<GroupPermissionRole>,
    pub file: Option<GroupPermissionRole>,
    pub poll: Option<GroupPermissionRole>,
    pub crypto: Option<GroupPermissionRole>,
    pub giphy: Option<GroupPermissionRole>,
    pub prize: Option<GroupPermissionRole>,
    pub p2p_swap: Option<GroupPermissionRole>,
    pub video_call: Option<GroupPermissionRole>,
    pub custom: Vec<CustomPermission>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CustomPermission {
    pub subtype: String,
    pub role: GroupPermissionRole,
}

#[derive(CandidType, Serialize, Deserialize, Copy, Clone, Debug, Default)]
pub enum GroupRole {
    Owner,
    Admin,
    Moderator,
    #[default]
    Participant,
}
