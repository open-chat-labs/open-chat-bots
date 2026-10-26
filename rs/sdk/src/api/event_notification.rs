use crate::{
    ecdsa, msgpack,
    oc_api::actions::community_events::CommunityEvent,
    types::{
        BotInstalledEvent, BotRegisteredEvent, BotUninstalledEvent, BridgedUserId, CanisterId,
        Chat, ChatEvent, CommunityId, EventIndex, MessageIndex, TimestampMillis, TokenError,
        UserId,
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
    /// Set when the event is a tip on the message, as the message's tips are each tipper's totals
    #[serde(default)]
    pub tip: Option<Box<BotMessageTip>>,
}

/// A tip on a message, which a bot is told of along with the message
#[derive(Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct BotMessageTip {
    pub tipped_by: UserId,
    pub ledger: CanisterId,
    pub token_symbol: String,
    /// In the token's smallest units
    pub amount: u128,
    pub decimals: u8,
    /// The account the message was relayed from, if no one had linked it, so OpenChat holds the
    /// tip for whoever links it, and refunds it if no one does within 30 days. None for an account
    /// on a platform this SDK doesn't know yet.
    #[serde(default, deserialize_with = "BridgedUserId::deserialize_known")]
    pub held_for: Option<BridgedUserId>,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::msgpack;
    use candid::Principal;
    use serde::Serialize;

    #[derive(Serialize)]
    struct Tip<P> {
        tipped_by: UserId,
        ledger: CanisterId,
        token_symbol: String,
        amount: u128,
        decimals: u8,
        held_for: Option<P>,
    }

    fn tip<P: Serialize>(held_for: Option<P>) -> Vec<u8> {
        msgpack::serialize_then_unwrap(Tip {
            tipped_by: Principal::from_slice(&[1]).into(),
            ledger: Principal::from_slice(&[2]).into(),
            token_symbol: "CHAT".to_string(),
            amount: 5_0000_0000,
            decimals: 8,
            held_for,
        })
    }

    #[test]
    fn a_tip_says_who_its_held_for() {
        let decoded: BotMessageTip =
            msgpack::deserialize_from_slice(&tip(Some(BridgedUserId::Telegram(42)))).unwrap();
        assert_eq!(decoded.held_for, Some(BridgedUserId::Telegram(42)));
        assert_eq!(decoded.amount, 5_0000_0000);

        let decoded: BotMessageTip =
            msgpack::deserialize_from_slice(&tip::<BridgedUserId>(None)).unwrap();
        assert_eq!(decoded.held_for, None);
    }

    // A platform bridged since this SDK was released
    #[test]
    fn a_tip_held_for_an_account_on_an_unknown_platform_still_decodes() {
        #[derive(Serialize)]
        enum Platform {
            Bluesky(u64),
        }

        let decoded: BotMessageTip =
            msgpack::deserialize_from_slice(&tip(Some(Platform::Bluesky(42)))).unwrap();
        assert_eq!(decoded.held_for, None);
        assert_eq!(decoded.token_symbol, "CHAT");
    }
}
