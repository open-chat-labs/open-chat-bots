use crate::{
    ecdsa, msgpack,
    oc_api::actions::community_events::CommunityEvent,
    types::{
        BotInstalledEvent, BotRegisteredEvent, BotUninstalledEvent, CanisterId, Chat, ChatEvent,
        CommunityId, EventIndex, MessageIndex, TimestampMillis, TokenError,
    },
};
use serde::Deserialize;
use std::str;

#[derive(Deserialize, Debug)]
pub struct BotEventWrapper {
    #[serde(alias = "g")]
    pub api_gateway: CanisterId,
    #[serde(alias = "e")]
    pub event: BotEvent,
    /// When the event happened, not when it was sent
    #[serde(default, alias = "t")]
    pub timestamp: TimestampMillis,
    /// Increases with each notification the api_gateway sends, to this bot or any other.
    /// OpenChat sends a notification again if the bot didn't answer it in time, so a bot which
    /// shouldn't act on an event twice drops one whose `(api_gateway, notification_index)` it has
    /// already had.
    #[serde(default, alias = "i")]
    pub notification_index: u64,
}

impl BotEventWrapper {
    /// Checks the notification was signed by OpenChat, then decodes it. Answer an error with a 4xx
    /// status, which OpenChat doesn't retry, as it would fail again.
    ///
    /// There's no check on its age: OpenChat retries delivery for a few minutes, and a notification
    /// can wait behind others, so a valid one can arrive well after its event happened.
    pub fn parse(
        payload: &[u8],
        signature_str: &str,
        public_key: &str,
    ) -> Result<Self, TokenError> {
        ecdsa::verify_payload(payload, signature_str, public_key)
            .map_err(|e| TokenError::Invalid(e.to_string()))?;

        msgpack::deserialize_from_slice::<Self>(payload)
            .map_err(|e| TokenError::Invalid(e.to_string()))
    }
}

#[derive(Deserialize, Debug)]
pub enum BotEvent {
    #[serde(alias = "c")]
    Chat(BotChatEvent),
    #[serde(alias = "u")]
    Community(BotCommunityEvent),
    #[serde(alias = "l")]
    Lifecycle(BotLifecycleEvent),
}

#[derive(Deserialize, Debug)]
pub struct BotChatEvent {
    #[serde(alias = "v")]
    pub event: ChatEvent,
    #[serde(alias = "c")]
    pub chat: Chat,
    #[serde(alias = "t")]
    pub thread: Option<MessageIndex>,
    #[serde(alias = "i")]
    pub event_index: EventIndex,
    #[serde(alias = "l")]
    pub latest_event_index: EventIndex,
}

#[derive(Deserialize, Debug)]
pub struct BotCommunityEvent {
    #[serde(alias = "e")]
    pub event: CommunityEvent,
    #[serde(alias = "c")]
    pub community_id: CommunityId,
    #[serde(alias = "i")]
    pub event_index: EventIndex,
    #[serde(alias = "l")]
    pub latest_event_index: EventIndex,
}

#[derive(Deserialize, Debug)]
pub enum BotLifecycleEvent {
    #[serde(alias = "r")]
    Registered(BotRegisteredEvent),
    #[serde(alias = "i")]
    Installed(BotInstalledEvent),
    #[serde(alias = "u")]
    Uninstalled(BotUninstalledEvent),
}
