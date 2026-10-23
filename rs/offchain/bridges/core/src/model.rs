use crate::store::{DynamoDbStore, InMemoryStore, KeyValueStore};
use anyhow::Result;
use oc_bots_sdk::types::{
    BridgePlatform, CanisterId, ChannelId, Chat, CommunityId, EventIndex, MessageId, Milliseconds,
    TimestampMillis,
};
use oc_bots_sdk_offchain::env;
use rand::Rng;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// A chat on the other platform, eg. a Discord channel's id
pub type PlatformChatId = String;
/// A message's id on the other platform
pub type PlatformMessageId = String;

const PAIRING_CODE_EXPIRY: Milliseconds = 15 * 60 * 1000;
// How long the bridge remembers a relayed message, to relay its edits and deletion and replies to
// it. Older ones are left alone.
const MESSAGE_REF_EXPIRY: Milliseconds = 90 * 24 * 60 * 60 * 1000;
// Longer than OpenChat keeps retrying a notification
const NOTIFICATION_EXPIRY: Milliseconds = 24 * 60 * 60 * 1000;

/// A chat on the other platform bridged with an OpenChat group or channel
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Pairing {
    pub platform_chat: PlatformChatId,
    pub oc_chat: Chat,
    pub api_gateway: CanisterId,
    /// What the platform needs to post into the chat, eg. a Discord webhook
    pub platform_data: Option<String>,
    /// When it was made, so OpenChat telling the bridge late that the bot was uninstalled can't
    /// remove a pairing made once it was installed again. 0 for those made before this was kept.
    #[serde(default)]
    pub paired_at: TimestampMillis,
}

/// A chat on the other platform waiting to be paired, by its code being given to the bridge bot's
/// `/bridge` command in OpenChat
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct PendingPairing {
    pub platform_chat: PlatformChatId,
    /// To show in OpenChat once paired, eg. "#general in Example"
    pub name: String,
    pub platform_data: Option<String>,
}

/// The OpenChat message a message on the other platform was relayed as, or was relayed from
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct InboundRef {
    /// The chat it's in, which only matches the pairing's if the chat hasn't been paired with
    /// another since
    pub oc_chat: Chat,
    pub message_id: MessageId,
    /// Unknown if the send was retried after succeeding the first time
    pub event_index: Option<EventIndex>,
    /// Set if the message is OpenChat's, relayed to the platform. It's kept so replies to it are
    /// relayed as replies, but its edits and deletion on the platform aren't relayed back.
    #[serde(default)]
    pub from_openchat: bool,
}

/// The message on the other platform an OpenChat message was relayed as
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct OutboundRef {
    /// The chat it was relayed to, which only matches the pairing's if the OpenChat chat hasn't
    /// been paired with another since. Empty for those saved before this was kept.
    #[serde(default)]
    pub platform_chat: PlatformChatId,
    pub platform_message_id: PlatformMessageId,
    /// Of the message's text, so a notification which doesn't change it, eg. when only its link
    /// previews were edited, isn't relayed as an edit
    pub content_hash: u64,
}

// The platform message an OpenChat event is, or was relayed as
#[derive(Serialize, Deserialize)]
struct EventRef {
    platform_chat: PlatformChatId,
    platform_message: PlatformMessageId,
}

/// Which of an account's photos the bridge has copied to its CDN, and when it last checked whether
/// the account had changed it
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct StoredAvatar {
    /// The platform's id for the photo, which changes when the account sets a new one. None if it
    /// has none the bridge can see.
    pub photo_id: Option<String>,
    /// The photo it replaced, which is deleted at the next check, once OpenChat's clients have had
    /// time to fetch the account's new profile
    pub replaced: Option<String>,
    pub checked: TimestampMillis,
}

/// The bridge's state for one platform, on top of a key-value store
#[derive(Clone)]
pub struct BridgeStore {
    kv: Arc<dyn KeyValueStore>,
    platform: &'static str,
}

impl BridgeStore {
    /// In the DynamoDB table `DYNAMODB_TABLE`, with AWS's credentials and region from the
    /// environment, or without one, in memory, which is lost on restart
    pub async fn from_env(platform: BridgePlatform) -> Self {
        let kv: Arc<dyn KeyValueStore> = match std::env::var("DYNAMODB_TABLE")
            .ok()
            .filter(|t| !t.trim().is_empty())
        {
            Some(table) => Arc::new(DynamoDbStore::new(table).await),
            None => {
                tracing::warn!(
                    "DYNAMODB_TABLE isn't set, so state is kept in memory and lost on restart"
                );
                Arc::new(InMemoryStore::default())
            }
        };
        Self::new(kv, platform)
    }

    pub fn new(kv: Arc<dyn KeyValueStore>, platform: BridgePlatform) -> Self {
        let platform = match platform {
            BridgePlatform::Discord => "discord",
            BridgePlatform::Telegram => "telegram",
        };
        BridgeStore { kv, platform }
    }

    pub async fn pairing(&self, platform_chat: &str) -> Result<Option<Pairing>> {
        self.get(&self.pairing_key(platform_chat)).await
    }

    pub async fn pairing_for_oc_chat(&self, chat: &Chat) -> Result<Option<Pairing>> {
        match self
            .get::<PlatformChatId>(&self.oc_pairing_key(chat))
            .await?
        {
            // The two keys are written separately, so this one may be left from an old pairing
            Some(platform_chat) => Ok(self
                .pairing(&platform_chat)
                .await?
                .filter(|pairing| pairing.oc_chat == *chat)),
            None => Ok(None),
        }
    }

    pub async fn save_pairing(&self, pairing: &Pairing) -> Result<()> {
        // Listed first, so the list holds every paired channel, even if a write below fails
        if let Chat::Channel(community, channel) = pairing.oc_chat {
            let mut channels = self.paired_channels(community).await?;
            if !channels.contains(&channel) {
                channels.push(channel);
                self.put(&self.community_key(community), &channels, None)
                    .await?;
            }
        }
        self.put(&self.pairing_key(&pairing.platform_chat), pairing, None)
            .await?;
        self.put(
            &self.oc_pairing_key(&pairing.oc_chat),
            &pairing.platform_chat,
            None,
        )
        .await
    }

    pub async fn remove_pairing(&self, pairing: &Pairing) -> Result<()> {
        self.kv
            .delete(&self.pairing_key(&pairing.platform_chat))
            .await?;
        self.kv
            .delete(&self.oc_pairing_key(&pairing.oc_chat))
            .await?;
        // A channel left in the list is harmless, as its pairing isn't found, so a failure here
        // doesn't fail the removal, eg. stopping the platform chat being told
        if let Chat::Channel(community, channel) = pairing.oc_chat
            && let Err(error) = self.unlist_channel(community, channel).await
        {
            tracing::warn!(%error, "Failed to remove a channel from its community's list");
        }
        Ok(())
    }

    // Changes to one community's list at the same moment could lose one, as each reads, then
    // writes, the whole list. Pairings change rarely enough that it isn't guarded against.
    async fn unlist_channel(&self, community: CommunityId, channel: ChannelId) -> Result<()> {
        let mut channels = self.paired_channels(community).await?;
        if channels.contains(&channel) {
            channels.retain(|c| *c != channel);
            if channels.is_empty() {
                self.kv.delete(&self.community_key(community)).await?;
            } else {
                self.put(&self.community_key(community), &channels, None)
                    .await?;
            }
        }
        Ok(())
    }

    /// The community's channels which are paired, so they can be unpaired if the bot's uninstalled
    /// from the community. Pairings are found by chat, so the community's can't be listed otherwise.
    pub async fn paired_channels(&self, community: CommunityId) -> Result<Vec<ChannelId>> {
        Ok(self
            .get(&self.community_key(community))
            .await?
            .unwrap_or_default())
    }

    /// Returns the code to give the bridge bot's `/bridge` command in OpenChat
    pub async fn start_pairing(&self, pending: &PendingPairing) -> Result<String> {
        let code = new_pairing_code();
        let expires = env::now() + PAIRING_CODE_EXPIRY;
        self.put(&self.pairing_code_key(&code), pending, Some(expires))
            .await?;
        Ok(code)
    }

    /// The code can only be used once
    pub async fn take_pending_pairing(&self, code: &str) -> Result<Option<PendingPairing>> {
        let key = self.pairing_code_key(&code.trim().to_uppercase());
        let pending = self.get(&key).await?;
        if pending.is_some() {
            self.kv.delete(&key).await?;
        }
        Ok(pending)
    }

    pub async fn inbound_ref(
        &self,
        platform_chat: &str,
        platform_message: &str,
    ) -> Result<Option<InboundRef>> {
        self.get(&self.inbound_key(platform_chat, platform_message))
            .await
    }

    pub async fn save_inbound_ref(
        &self,
        platform_chat: &str,
        platform_message: &str,
        inbound: InboundRef,
    ) -> Result<()> {
        let expires = Some(env::now() + MESSAGE_REF_EXPIRY);
        self.put(
            &self.inbound_key(platform_chat, platform_message),
            &inbound,
            expires,
        )
        .await
    }

    pub async fn outbound_ref(
        &self,
        chat: &Chat,
        message_id: MessageId,
    ) -> Result<Option<OutboundRef>> {
        self.get(&self.outbound_key(chat, message_id)).await
    }

    pub async fn save_outbound_ref(
        &self,
        chat: &Chat,
        message_id: MessageId,
        outbound: &OutboundRef,
    ) -> Result<()> {
        let expires = Some(env::now() + MESSAGE_REF_EXPIRY);
        self.put(&self.outbound_key(chat, message_id), outbound, expires)
            .await
    }

    pub async fn remove_outbound_ref(&self, chat: &Chat, message_id: MessageId) -> Result<()> {
        self.kv.delete(&self.outbound_key(chat, message_id)).await
    }

    /// The message in `platform_chat` which is, or was relayed as, the OpenChat message at
    /// `event_index`, so a reply in OpenChat can be relayed as a reply to it
    pub async fn platform_message_at(
        &self,
        chat: &Chat,
        event_index: EventIndex,
        platform_chat: &str,
    ) -> Result<Option<PlatformMessageId>> {
        let event_ref: Option<EventRef> = self.get(&self.event_key(chat, event_index)).await?;
        Ok(event_ref
            .filter(|r| r.platform_chat == platform_chat)
            .map(|r| r.platform_message))
    }

    pub async fn save_platform_message_at(
        &self,
        chat: &Chat,
        event_index: EventIndex,
        platform_chat: &str,
        platform_message: &str,
    ) -> Result<()> {
        let expires = Some(env::now() + MESSAGE_REF_EXPIRY);
        let event_ref = EventRef {
            platform_chat: platform_chat.to_string(),
            platform_message: platform_message.to_string(),
        };
        self.put(&self.event_key(chat, event_index), &event_ref, expires)
            .await
    }

    /// Whether a notification was handled already, so a repeat of it should be dropped
    pub async fn notification_handled(
        &self,
        api_gateway: CanisterId,
        notification_index: u64,
    ) -> Result<bool> {
        Ok(self
            .kv
            .get(&self.notification_key(api_gateway, notification_index))
            .await?
            .is_some())
    }

    /// Only once it has been handled, so if handling it failed, OpenChat's retry is handled
    pub async fn mark_notification_handled(
        &self,
        api_gateway: CanisterId,
        notification_index: u64,
    ) -> Result<()> {
        let expires = Some(env::now() + NOTIFICATION_EXPIRY);
        self.kv
            .put(
                &self.notification_key(api_gateway, notification_index),
                Vec::new(),
                expires,
            )
            .await
    }

    pub async fn avatar(&self, platform_user: &str) -> Result<Option<StoredAvatar>> {
        self.get(&self.avatar_key(platform_user)).await
    }

    pub async fn save_avatar(&self, platform_user: &str, avatar: &StoredAvatar) -> Result<()> {
        self.put(&self.avatar_key(platform_user), avatar, None)
            .await
    }

    async fn get<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>> {
        match self.kv.get(key).await? {
            Some(bytes) => Ok(Some(serde_json::from_slice(&bytes)?)),
            None => Ok(None),
        }
    }

    async fn put<T: Serialize>(
        &self,
        key: &str,
        value: &T,
        expires: Option<TimestampMillis>,
    ) -> Result<()> {
        self.kv.put(key, serde_json::to_vec(value)?, expires).await
    }

    fn notification_key(&self, api_gateway: CanisterId, notification_index: u64) -> String {
        format!(
            "notification/{}/{api_gateway}/{notification_index}",
            self.platform
        )
    }

    fn avatar_key(&self, platform_user: &str) -> String {
        format!("avatar/{}/{platform_user}", self.platform)
    }

    fn pairing_key(&self, platform_chat: &str) -> String {
        format!("pairing/{}/{platform_chat}", self.platform)
    }

    fn oc_pairing_key(&self, chat: &Chat) -> String {
        format!("pairing/{}/oc/{}", self.platform, chat_key(chat))
    }

    fn community_key(&self, community: CommunityId) -> String {
        format!("pairing/{}/community/{community}", self.platform)
    }

    fn pairing_code_key(&self, code: &str) -> String {
        format!("pairing_code/{}/{code}", self.platform)
    }

    fn inbound_key(&self, platform_chat: &str, platform_message: &str) -> String {
        format!(
            "inbound/{}/{platform_chat}/{platform_message}",
            self.platform
        )
    }

    fn outbound_key(&self, chat: &Chat, message_id: MessageId) -> String {
        format!("outbound/{}/{}/{message_id}", self.platform, chat_key(chat))
    }

    fn event_key(&self, chat: &Chat, event_index: EventIndex) -> String {
        format!("event/{}/{}/{event_index}", self.platform, chat_key(chat))
    }
}

pub fn chat_key(chat: &Chat) -> String {
    match chat {
        Chat::Direct(id) => format!("d/{id}"),
        Chat::Group(id) => format!("g/{id}"),
        Chat::Channel(community, channel) => format!("c/{community}/{channel}"),
    }
}

// 8 characters which can't be mistaken for one another, eg. no O and 0, shown as XXXX-XXXX
fn new_pairing_code() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let chars: String = (0..8)
        .map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char)
        .collect();
    format!("{}-{}", &chars[..4], &chars[4..])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::InMemoryStore;
    use ic_agent::export::Principal;

    fn store() -> BridgeStore {
        BridgeStore::new(Arc::new(InMemoryStore::default()), BridgePlatform::Discord)
    }

    #[tokio::test]
    async fn pairing_is_found_from_either_side_until_removed() {
        let store = store();
        let chat = Chat::Channel(Principal::anonymous().into(), 7);
        let pairing = Pairing {
            platform_chat: "123".to_string(),
            oc_chat: chat,
            api_gateway: Principal::anonymous().into(),
            platform_data: Some("webhook".to_string()),
            paired_at: 0,
        };

        store.save_pairing(&pairing).await.unwrap();
        assert_eq!(store.pairing("123").await.unwrap(), Some(pairing.clone()));
        assert_eq!(
            store.pairing_for_oc_chat(&chat).await.unwrap(),
            Some(pairing.clone())
        );

        store.remove_pairing(&pairing).await.unwrap();
        assert_eq!(store.pairing("123").await.unwrap(), None);
        assert_eq!(store.pairing_for_oc_chat(&chat).await.unwrap(), None);
    }

    // So they can be unpaired if the bot's uninstalled from the community
    #[tokio::test]
    async fn a_communitys_paired_channels_are_listed() {
        let store = store();
        let community = Principal::anonymous().into();
        let pairing = |platform_chat: &str, channel| Pairing {
            platform_chat: platform_chat.to_string(),
            oc_chat: Chat::Channel(community, channel),
            api_gateway: Principal::anonymous().into(),
            platform_data: None,
            paired_at: 0,
        };

        store.save_pairing(&pairing("1", 7)).await.unwrap();
        store.save_pairing(&pairing("2", 8)).await.unwrap();
        // Saved again, eg. re-paired with the same platform chat
        store.save_pairing(&pairing("1", 7)).await.unwrap();
        assert_eq!(store.paired_channels(community).await.unwrap(), [7, 8]);

        store.remove_pairing(&pairing("1", 7)).await.unwrap();
        assert_eq!(store.paired_channels(community).await.unwrap(), [8]);
        store.remove_pairing(&pairing("2", 8)).await.unwrap();
        assert!(store.paired_channels(community).await.unwrap().is_empty());
    }

    // If removing a pairing fails between its two keys, the OpenChat chat's key is left pointing at
    // a platform chat which may be paired with another OpenChat chat later
    #[tokio::test]
    async fn a_stale_reverse_key_isnt_followed() {
        let store = store();
        let old_chat = Chat::Group(Principal::from_slice(&[1]).into());
        let new_chat = Chat::Group(Principal::from_slice(&[2]).into());
        let pairing = |oc_chat| Pairing {
            platform_chat: "123".to_string(),
            oc_chat,
            api_gateway: Principal::anonymous().into(),
            platform_data: None,
            paired_at: 0,
        };

        store.save_pairing(&pairing(old_chat)).await.unwrap();
        store.save_pairing(&pairing(new_chat)).await.unwrap();

        assert_eq!(store.pairing_for_oc_chat(&old_chat).await.unwrap(), None);
        assert_eq!(
            store.pairing_for_oc_chat(&new_chat).await.unwrap(),
            Some(pairing(new_chat))
        );
    }

    #[tokio::test]
    async fn an_event_ref_is_only_found_for_its_platform_chat() {
        let store = store();
        let chat = Chat::Group(Principal::from_slice(&[1]).into());

        store
            .save_platform_message_at(&chat, 5, "123", "99")
            .await
            .unwrap();

        assert_eq!(
            store.platform_message_at(&chat, 5, "123").await.unwrap(),
            Some("99".to_string())
        );
        assert_eq!(
            store.platform_message_at(&chat, 5, "456").await.unwrap(),
            None
        );
    }

    #[tokio::test]
    async fn a_pairing_code_works_once() {
        let store = store();
        let pending = PendingPairing {
            platform_chat: "123".to_string(),
            name: "#general".to_string(),
            platform_data: None,
        };

        let code = store.start_pairing(&pending).await.unwrap();
        assert_eq!(code.len(), 9);

        // Codes are forgiving of case and surrounding spaces, as people type them in
        let typed = format!(" {} ", code.to_lowercase());
        assert_eq!(
            store.take_pending_pairing(&typed).await.unwrap(),
            Some(pending)
        );
        assert_eq!(store.take_pending_pairing(&code).await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_handled_notification_is_remembered() {
        let store = store();
        let api_gateway: CanisterId = Principal::anonymous().into();

        assert!(!store.notification_handled(api_gateway, 5).await.unwrap());
        store
            .mark_notification_handled(api_gateway, 5)
            .await
            .unwrap();
        assert!(store.notification_handled(api_gateway, 5).await.unwrap());
        assert!(!store.notification_handled(api_gateway, 6).await.unwrap());
    }
}
