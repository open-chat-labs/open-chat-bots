use crate::bitflags::{decode_from_bitflags, encode_as_bitflags};
use candid::CandidType;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::hash::Hash;

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct BotPermissions {
    #[serde(default, skip_serializing_if = "is_zero")]
    community: u32,
    #[serde(default, skip_serializing_if = "is_zero")]
    chat: u32,
    #[serde(default, skip_serializing_if = "is_zero")]
    message: u32,
}

fn is_zero(value: &u32) -> bool {
    *value == 0
}

impl BotPermissions {
    pub fn with_community(self, community: &HashSet<CommunityPermission>) -> Self {
        Self {
            community: Self::encode(community),
            ..self
        }
    }

    pub fn with_chat(self, chat: &HashSet<ChatPermission>) -> Self {
        Self {
            chat: Self::encode(chat),
            ..self
        }
    }

    pub fn with_message(self, message: &HashSet<MessagePermission>) -> Self {
        Self {
            message: Self::encode(message),
            ..self
        }
    }

    pub fn community(&self) -> HashSet<CommunityPermission> {
        Self::decode(self.community)
    }

    pub fn chat(&self) -> HashSet<ChatPermission> {
        Self::decode(self.chat)
    }

    pub fn message(&self) -> HashSet<MessagePermission> {
        Self::decode(self.message)
    }

    pub fn is_empty(&self) -> bool {
        self.community == 0 && self.chat == 0 && self.message == 0
    }

    pub fn is_subset(&self, other: &Self) -> bool {
        fn is_subset(x: u32, y: u32) -> bool {
            intersect_bits(x, y) == x
        }

        is_subset(self.community, other.community)
            && is_subset(self.chat, other.chat)
            && is_subset(self.message, other.message)
    }

    pub fn intersect(&self, other: &Self) -> Self {
        Self {
            community: intersect_bits(self.community, other.community),
            chat: intersect_bits(self.chat, other.chat),
            message: intersect_bits(self.message, other.message),
        }
    }

    pub fn union(&self, other: &Self) -> Self {
        Self {
            community: union_bits(self.community, other.community),
            chat: union_bits(self.chat, other.chat),
            message: union_bits(self.message, other.message),
        }
    }

    pub fn text_only() -> Self {
        Self::from_message_permission(MessagePermission::Text)
    }

    pub fn from_message_permission(permission: MessagePermission) -> Self {
        Self {
            message: encode_as_bitflags([permission as u8].into_iter()),
            ..Default::default()
        }
    }

    pub fn from_chat_permission(permission: ChatPermission) -> Self {
        Self {
            chat: encode_as_bitflags([permission as u8].into_iter()),
            ..Default::default()
        }
    }

    pub fn from_community_permission(permission: CommunityPermission) -> Self {
        Self {
            community: encode_as_bitflags([permission as u8].into_iter()),
            ..Default::default()
        }
    }

    fn encode<T: Into<u8> + Copy>(field: &HashSet<T>) -> u32 {
        encode_as_bitflags(field.iter().map(|v| (*v).into()))
    }

    fn decode<T: TryFrom<u8> + Copy + Eq + Hash>(field: u32) -> HashSet<T> {
        decode_from_bitflags(field)
            .into_iter()
            .filter_map(|v| v.try_into().ok())
            .collect()
    }
}

fn intersect_bits(x: u32, y: u32) -> u32 {
    let mut intersection = [0; 4];
    for (i, (x_byte, y_byte)) in x.to_be_bytes().into_iter().zip(y.to_be_bytes()).enumerate() {
        intersection[i] = x_byte & y_byte;
    }
    u32::from_be_bytes(intersection)
}

fn union_bits(x: u32, y: u32) -> u32 {
    let mut union = [0; 4];
    for (i, (x_byte, y_byte)) in x.to_be_bytes().into_iter().zip(y.to_be_bytes()).enumerate() {
        union[i] = x_byte | y_byte;
    }
    u32::from_be_bytes(union)
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

#[cfg(test)]
mod tests {
    use super::*;
    use rand::random;

    #[test]
    fn permissions_round_trip() {
        for _ in 0..20 {
            let mut community = HashSet::new();
            let mut chat = HashSet::new();
            let mut message = HashSet::new();

            for i in 0..20 {
                if let Ok(c) = CommunityPermission::try_from(i) {
                    if random() {
                        community.insert(c);
                    }
                }
                if let Ok(c) = ChatPermission::try_from(i) {
                    if random() {
                        chat.insert(c);
                    }
                }
                if let Ok(m) = MessagePermission::try_from(i) {
                    if random() {
                        message.insert(m);
                    }
                }
            }

            let permissions = BotPermissions::default()
                .with_community(&community)
                .with_chat(&chat)
                .with_message(&message);

            assert_eq!(community, permissions.community());
            assert_eq!(chat, permissions.chat());
            assert_eq!(message, permissions.message());
        }
    }

    #[test]
    fn permissions_is_subset() {
        for _ in 0..20 {
            let mut x = HashSet::new();
            let mut y = HashSet::new();

            let mut is_subset = true;
            if random() {
                x.insert(CommunityPermission::CreatePublicChannel);
                if random() {
                    y.insert(CommunityPermission::CreatePublicChannel);
                } else {
                    is_subset = false;
                }
            }
            if random() {
                x.insert(CommunityPermission::CreatePrivateChannel);
                if random() {
                    y.insert(CommunityPermission::CreatePrivateChannel);
                } else {
                    is_subset = false;
                }
            }

            let x = BotPermissions::default().with_community(&x);
            let y = BotPermissions::default().with_community(&y);

            assert_eq!(x.is_subset(&y), is_subset);
        }
    }

    #[test]
    fn permissions_intersect() {
        for _ in 0..20 {
            let mut x = HashSet::new();
            let mut y = HashSet::new();
            let mut intersect = HashSet::new();

            if random() {
                x.insert(CommunityPermission::CreatePublicChannel);
                if random() {
                    y.insert(CommunityPermission::CreatePublicChannel);
                    intersect.insert(CommunityPermission::CreatePublicChannel);
                }
            } else if random() {
                y.insert(CommunityPermission::CreatePublicChannel);
            }
            if random() {
                x.insert(CommunityPermission::CreatePrivateChannel);
                if random() {
                    y.insert(CommunityPermission::CreatePrivateChannel);
                    intersect.insert(CommunityPermission::CreatePrivateChannel);
                }
            } else if random() {
                y.insert(CommunityPermission::CreatePrivateChannel);
            }

            let x = BotPermissions::default().with_community(&x);
            let y = BotPermissions::default().with_community(&y);
            let expected = BotPermissions::default().with_community(&intersect);

            assert_eq!(x.intersect(&y), expected);
        }
    }

    #[test]
    fn permissions_union() {
        for _ in 0..20 {
            let mut x = HashSet::new();
            let mut y = HashSet::new();
            let mut union = HashSet::new();

            if random() {
                x.insert(CommunityPermission::CreatePublicChannel);
                union.insert(CommunityPermission::CreatePublicChannel);
            } else if random() {
                y.insert(CommunityPermission::CreatePublicChannel);
                union.insert(CommunityPermission::CreatePublicChannel);
            }
            if random() {
                x.insert(CommunityPermission::CreatePrivateChannel);
                union.insert(CommunityPermission::CreatePrivateChannel);
            } else if random() {
                y.insert(CommunityPermission::CreatePrivateChannel);
                union.insert(CommunityPermission::CreatePrivateChannel);
            }

            let x = BotPermissions::default().with_community(&x);
            let y = BotPermissions::default().with_community(&y);
            let expected = BotPermissions::default().with_community(&union);

            assert_eq!(x.union(&y), expected);
        }
    }
}
