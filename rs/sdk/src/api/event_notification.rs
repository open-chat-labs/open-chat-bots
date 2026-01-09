use crate::{
    ecdsa, msgpack,
    oc_api::actions::community_events::CommunityEvent,
    types::{
        BotInstalledEvent, BotRegisteredEvent, BotUninstalledEvent, CanisterId, Chat, ChatEvent,
        CommunityId, EventIndex, MessageIndex, TimestampMillis, TokenError,
    },
};
use candid::CandidType;
use serde::Deserialize;
use std::str;

#[derive(CandidType, Deserialize)]
pub struct BotEventWrapper {
    #[serde(alias = "g")]
    pub api_gateway: CanisterId,
    #[serde(alias = "e")]
    pub event: BotEvent,
    #[serde(default, alias = "t")]
    pub timestamp: TimestampMillis,
}

impl BotEventWrapper {
    pub fn parse(
        payload: &[u8],
        signature_str: &str,
        public_key: &str,
        now: TimestampMillis,
    ) -> Result<Self, TokenError> {
        ecdsa::verify_payload(payload, signature_str, public_key)
            .map_err(|e| TokenError::Invalid(e.to_string()))?;

        let result = msgpack::deserialize_from_slice::<Self>(payload)
            .map_err(|e| TokenError::Invalid(e.to_string()))?;

        if now > result.timestamp + 5 * 60 * 1000 {
            return Err(TokenError::Invalid(
                "Event timestamp is too old".to_string(),
            ));
        }

        Ok(result)
    }
}

#[derive(CandidType, Deserialize, Debug)]
pub enum BotEvent {
    #[serde(alias = "c")]
    Chat(BotChatEvent),
    #[serde(alias = "u")]
    Community(BotCommunityEvent),
    #[serde(alias = "l")]
    Lifecycle(BotLifecycleEvent),
}

#[derive(CandidType, Deserialize, Debug)]
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

#[derive(CandidType, Deserialize, Debug)]
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

#[derive(CandidType, Deserialize, Debug)]
pub enum BotLifecycleEvent {
    #[serde(alias = "r")]
    Registered(BotRegisteredEvent),
    #[serde(alias = "i")]
    Installed(BotInstalledEvent),
    #[serde(alias = "u")]
    Uninstalled(BotUninstalledEvent),
}
