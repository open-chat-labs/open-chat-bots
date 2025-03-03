use crate::bitflags::{decode_from_bitflags, encode_as_bitflags};
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

    pub fn from_chat_permission(permission: ChatPermission) -> Self {
        Self {
            community: HashSet::new(),
            chat: HashSet::from_iter([permission]),
            message: HashSet::new(),
        }
    }

    pub fn from_community_permission(permission: CommunityPermission) -> Self {
        Self {
            community: HashSet::from_iter([permission]),
            chat: HashSet::new(),
            message: HashSet::new(),
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

impl From<CommunityPermission> for u8 {
    fn from(value: CommunityPermission) -> Self {
        value as u8
    }
}

impl TryFrom<u8> for CommunityPermission {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(CommunityPermission::ChangeRoles),
            1 => Ok(CommunityPermission::UpdateDetails),
            2 => Ok(CommunityPermission::InviteUsers),
            3 => Ok(CommunityPermission::RemoveMembers),
            4 => Ok(CommunityPermission::CreatePublicChannel),
            5 => Ok(CommunityPermission::CreatePrivateChannel),
            6 => Ok(CommunityPermission::ManageUserGroups),
            _ => Err(()),
        }
    }
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
    ReadMessages = 10,
    ReadMembership = 11,
    ReadChatDetails = 12,
}

impl From<ChatPermission> for u8 {
    fn from(value: ChatPermission) -> Self {
        value as u8
    }
}

impl TryFrom<u8> for ChatPermission {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(ChatPermission::ChangeRoles),
            1 => Ok(ChatPermission::UpdateGroup),
            2 => Ok(ChatPermission::AddMembers),
            3 => Ok(ChatPermission::InviteUsers),
            4 => Ok(ChatPermission::RemoveMembers),
            5 => Ok(ChatPermission::DeleteMessages),
            6 => Ok(ChatPermission::PinMessages),
            7 => Ok(ChatPermission::ReactToMessages),
            8 => Ok(ChatPermission::MentionAllMembers),
            9 => Ok(ChatPermission::StartVideoCall),
            _ => Err(()),
        }
    }
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

impl From<MessagePermission> for u8 {
    fn from(value: MessagePermission) -> Self {
        value as u8
    }
}

impl TryFrom<u8> for MessagePermission {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(MessagePermission::Text),
            1 => Ok(MessagePermission::Image),
            2 => Ok(MessagePermission::Video),
            3 => Ok(MessagePermission::Audio),
            4 => Ok(MessagePermission::File),
            5 => Ok(MessagePermission::Poll),
            6 => Ok(MessagePermission::Crypto),
            7 => Ok(MessagePermission::Giphy),
            8 => Ok(MessagePermission::Prize),
            9 => Ok(MessagePermission::P2pSwap),
            10 => Ok(MessagePermission::VideoCall),
            _ => Err(()),
        }
    }
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

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct EncodedBotPermissions {
    #[serde(skip_serializing_if = "Option::is_none")]
    community: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    chat: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<u32>,
}

impl From<BotPermissions> for EncodedBotPermissions {
    fn from(permissions: BotPermissions) -> Self {
        EncodedBotPermissions::from(&permissions)
    }
}

impl From<&BotPermissions> for EncodedBotPermissions {
    fn from(permissions: &BotPermissions) -> Self {
        fn encode<T: Into<u8> + Copy>(field: &HashSet<T>) -> Option<u32> {
            if field.is_empty() {
                None
            } else {
                Some(encode_as_bitflags(field.iter().map(|v| (*v).into())))
            }
        }

        EncodedBotPermissions {
            community: encode(&permissions.community),
            chat: encode(&permissions.chat),
            message: encode(&permissions.message),
        }
    }
}

impl From<EncodedBotPermissions> for BotPermissions {
    fn from(permissions: EncodedBotPermissions) -> Self {
        BotPermissions::from(&permissions)
    }
}

impl From<&EncodedBotPermissions> for BotPermissions {
    fn from(permissions: &EncodedBotPermissions) -> Self {
        fn decode<T: TryFrom<u8> + Copy + Eq + Hash>(field: Option<u32>) -> HashSet<T> {
            field
                .map(decode_from_bitflags)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|v| v.try_into().ok())
                .collect()
        }

        BotPermissions {
            community: decode(permissions.community),
            chat: decode(permissions.chat),
            message: decode(permissions.message),
        }
    }
}
