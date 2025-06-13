use crate::types::{
    BotInstalledEvent, BotRegisteredEvent, BotUninstalledEvent, CanisterId, Chat, ChatEventType,
    CommunityEventType, CommunityId, EventIndex, MessageIndex, UserId,
};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct BotEventWrapper {
    #[serde(rename = "g")]
    pub api_gateway: CanisterId,
    #[serde(rename = "e")]
    pub event: BotEvent,
}

#[derive(Deserialize, Debug)]
pub enum BotEvent {
    #[serde(rename = "c")]
    Chat(BotChatEvent),
    #[serde(rename = "u")]
    Community(BotCommunityEvent),
    #[serde(rename = "l")]
    Lifecycle(BotLifecycleEvent),
}

#[derive(Deserialize, Debug)]
pub struct BotChatEvent {
    #[serde(rename = "e")]
    pub event_type: ChatEventType,
    #[serde(rename = "c")]
    pub chat: Chat,
    #[serde(rename = "t")]
    pub thread: Option<MessageIndex>,
    #[serde(rename = "i")]
    pub event_index: EventIndex,
    #[serde(rename = "l")]
    pub latest_event_index: EventIndex,
    #[serde(rename = "u")]
    pub initiated_by: Option<UserId>,
}

#[derive(Deserialize, Debug)]
pub struct BotCommunityEvent {
    #[serde(rename = "e")]
    pub event_type: CommunityEventType,
    #[serde(rename = "c")]
    pub community_id: CommunityId,
    #[serde(rename = "i")]
    pub event_index: EventIndex,
    #[serde(rename = "l")]
    pub latest_event_index: EventIndex,
    #[serde(rename = "u")]
    pub initiated_by: Option<UserId>,
}

#[derive(Deserialize, Debug)]
pub enum BotLifecycleEvent {
    #[serde(rename = "r")]
    Registered(BotRegisteredEvent),
    #[serde(rename = "i")]
    Installed(BotInstalledEvent),
    #[serde(rename = "u")]
    Uninstalled(BotUninstalledEvent),
}
