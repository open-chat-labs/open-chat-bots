use crate::model::{
    BridgeStore, InboundRef, OutboundRef, Pairing, PendingPairing, PlatformMessageId,
};
use crate::openchat::{Author, LinkedUser, OpenChat};
use crate::platform::{InboundMessage, OutboundMessage, PermanentFailure, Platform};
use crate::util::{
    content_hash, inbound_message_id, mentioned_user_ids, message_text, transfer_ledger,
    without_mention_everyone,
};
use anyhow::Result;
use oc_bots_sdk::api::event_notification::{
    BotChatEvent, BotEvent, BotEventWrapper, BotLifecycleEvent,
};
use oc_bots_sdk::types::{
    BridgePlatform, BridgedUser, BridgedUserId, CanisterId, Chat, ChatEvent, InstallationLocation,
    Message, TimestampMillis,
};
use oc_bots_sdk_offchain::env;
use std::collections::HashSet;
use std::sync::Mutex;
use tracing::{info, warn};

/// What came of a notification from OpenChat, as the HTTP status to answer it with
#[derive(Debug, PartialEq, Eq)]
pub enum NotificationOutcome {
    Handled,
    /// It wasn't signed by OpenChat or couldn't be decoded, so OpenChat shouldn't retry it
    Invalid,
    /// Relaying it failed for now, eg. the platform was unavailable, or it's still being relayed
    /// from an earlier delivery, so OpenChat should retry it
    Failed,
}

/// A bridge between OpenChat and one platform
pub struct Bridge<P> {
    pub openchat: OpenChat,
    pub store: BridgeStore,
    pub platform: P,
    // Notifications being relayed. OpenChat sends one again if the bridge takes too long to
    // answer, eg. while a busy chat waits on the platform's rate limits.
    in_flight: Mutex<HashSet<(CanisterId, u64)>>,
}

impl<P: Platform> Bridge<P> {
    pub fn new(openchat: OpenChat, store: BridgeStore, platform: P) -> Self {
        Bridge {
            openchat,
            store,
            platform,
            in_flight: Mutex::default(),
        }
    }

    // From the platform

    /// Relays a message from the platform into the OpenChat chat its chat is paired with, if any
    pub async fn relay_inbound(&self, mut message: InboundMessage) -> Result<()> {
        let Some(pairing) = self.store.pairing(&message.platform_chat).await? else {
            return Ok(());
        };
        if message.text.trim().is_empty() {
            return Ok(());
        }
        self.platform.complete_author(&mut message.author).await;

        let replies_to = match &message.reply_to {
            Some(reply_to) => self
                .inbound_ref(&pairing, reply_to)
                .await?
                .and_then(|r| r.event_index),
            None => None,
        };

        let message_id = inbound_message_id(&message.platform_chat, &message.platform_message);
        let event_index = self
            .openchat
            .send(
                &pairing,
                message_id,
                message.author,
                message.text,
                replies_to,
            )
            .await?;

        let inbound_ref = InboundRef {
            oc_chat: pairing.oc_chat,
            message_id,
            event_index,
            from_openchat: false,
        };
        self.store
            .save_inbound_ref(
                &message.platform_chat,
                &message.platform_message,
                inbound_ref,
            )
            .await?;
        if let Some(event_index) = event_index {
            self.store
                .save_platform_message_at(
                    &pairing.oc_chat,
                    event_index,
                    &pairing.platform_chat,
                    &message.platform_message,
                )
                .await?;
        }
        Ok(())
    }

    /// Relays an edit of a message the bridge relayed into OpenChat
    pub async fn relay_inbound_edit(
        &self,
        platform_chat: &str,
        platform_message: &str,
        text: String,
    ) -> Result<()> {
        let Some(pairing) = self.store.pairing(platform_chat).await? else {
            return Ok(());
        };
        // A message sent before the chat was paired wasn't relayed, so neither are its edits.
        // OpenChat's own messages are only edited in OpenChat.
        let Some(inbound) = self.inbound_ref(&pairing, platform_message).await? else {
            return Ok(());
        };
        if inbound.from_openchat || text.trim().is_empty() {
            return Ok(());
        }
        self.openchat.edit(&pairing, inbound.message_id, text).await
    }

    /// Relays the deletion of a message the bridge relayed into OpenChat
    pub async fn relay_inbound_delete(
        &self,
        platform_chat: &str,
        platform_message: &str,
    ) -> Result<()> {
        let Some(pairing) = self.store.pairing(platform_chat).await? else {
            return Ok(());
        };
        // OpenChat's own messages aren't deleted by deleting their copies on the platform
        let Some(inbound) = self
            .inbound_ref(&pairing, platform_message)
            .await?
            .filter(|inbound| !inbound.from_openchat)
        else {
            return Ok(());
        };
        self.openchat.delete(&pairing, inbound.message_id).await
    }

    // Only one for the chat the platform chat is paired with now, not one it was paired with before
    async fn inbound_ref(
        &self,
        pairing: &Pairing,
        platform_message: &str,
    ) -> Result<Option<InboundRef>> {
        Ok(self
            .store
            .inbound_ref(&pairing.platform_chat, platform_message)
            .await?
            .filter(|inbound| inbound.oc_chat == pairing.oc_chat))
    }

    /// Returns the code to give the bridge bot's `/bridge` command in the OpenChat chat to pair
    /// with
    pub async fn start_pairing(&self, pending: &PendingPairing) -> Result<String> {
        self.store.start_pairing(pending).await
    }

    /// Returns whether the chat was paired
    pub async fn unpair_platform_chat(&self, platform_chat: &str) -> Result<bool> {
        let Some(pairing) = self.store.pairing(platform_chat).await? else {
            return Ok(false);
        };
        self.unpair(&pairing).await?;
        Ok(true)
    }

    /// For when the platform gives a chat a new id, eg. Telegram upgrading a group to a
    /// supergroup. Returns whether the chat was paired.
    pub async fn move_pairing(
        &self,
        old_platform_chat: &str,
        new_platform_chat: &str,
    ) -> Result<bool> {
        let Some(pairing) = self.store.pairing(old_platform_chat).await? else {
            return Ok(false);
        };
        self.store.remove_pairing(&pairing).await?;
        let moved = Pairing {
            platform_chat: new_platform_chat.to_string(),
            ..pairing
        };
        self.store.save_pairing(&moved).await?;
        info!(old_platform_chat, new_platform_chat, "Moved a pairing");
        Ok(true)
    }

    /// Unpairs the chats, and says so in both
    pub async fn unpair(&self, pairing: &Pairing) -> Result<()> {
        self.store.remove_pairing(pairing).await?;
        self.platform_unpaired(pairing).await;
        self.say_no_longer_bridged(pairing).await;
        info!(platform_chat = pairing.platform_chat, "Unpaired");
        Ok(())
    }

    // eg. to say so in the platform chat, and remove what the bridge posted there with
    async fn platform_unpaired(&self, pairing: &Pairing) {
        if let Err(error) = self.platform.unpaired(pairing).await {
            warn!(%error, "Failed to clean up after unpairing");
        }
    }

    async fn say_no_longer_bridged(&self, pairing: &Pairing) {
        let text = format!("This chat is no longer bridged with {}.", P::NAME);
        if let Err(error) = self.openchat.send_notice(pairing, text).await {
            warn!(%error, "Failed to say in OpenChat that the chat is no longer bridged");
        }
    }

    /// Pairs the OpenChat chat with the platform chat `code` was given for. A chat paired already,
    /// on either side, is unpaired first. Returns the platform chat's name, or None if the code is
    /// unknown or has expired.
    pub async fn complete_pairing(
        &self,
        code: &str,
        oc_chat: Chat,
        api_gateway: CanisterId,
    ) -> Result<Option<String>> {
        let Some(pending) = self.store.take_pending_pairing(code).await? else {
            return Ok(None);
        };

        // The pairings either chat had before are removed, then the chats are told once the new one
        // is saved, so a slow call to a chat can't hold it up
        let platform_chat_paired = self.store.pairing(&pending.platform_chat).await?;
        if let Some(existing) = &platform_chat_paired {
            self.store.remove_pairing(existing).await?;
        }
        let oc_chat_paired = self.store.pairing_for_oc_chat(&oc_chat).await?;
        if let Some(existing) = &oc_chat_paired {
            self.store.remove_pairing(existing).await?;
        }

        let pairing = Pairing {
            platform_chat: pending.platform_chat,
            oc_chat,
            api_gateway,
            platform_data: pending.platform_data,
            paired_at: env::now(),
        };
        self.store.save_pairing(&pairing).await?;
        info!(platform_chat = pairing.platform_chat, ?oc_chat, "Paired");

        // The platform chat's webhook, or whatever else the platform posts with, is reused by the
        // new pairing, so only the OpenChat chat it was bridged with is told
        if let Some(existing) = platform_chat_paired.filter(|existing| existing.oc_chat != oc_chat)
        {
            self.say_no_longer_bridged(&existing).await;
        }
        // The OpenChat chat is about to be told it's bridged with another
        if let Some(existing) = &oc_chat_paired {
            self.platform_unpaired(existing).await;
        }
        if let Err(error) = self.platform.paired(&pairing).await {
            warn!(%error, "Failed to announce the pairing");
        }
        // Otherwise only whoever ran /bridge would know. The name is the platform chat's, which
        // its admins choose, so it can't mention everyone.
        let text = format!(
            "This chat is now bridged with {} on {}, so messages sent in either appear in both.",
            without_mention_everyone(&pending.name),
            P::NAME
        );
        if let Err(error) = self.openchat.send_notice(&pairing, text).await {
            warn!(%error, "Failed to announce the pairing in OpenChat");
        }
        Ok(Some(pending.name))
    }

    /// Links the platform account to the OpenChat user who was given `code` from their profile
    pub async fn link(&self, user: BridgedUser, code: String) -> Result<LinkedUser> {
        self.openchat.link(user, code).await
    }

    /// Unlinks the platform account from whoever it's linked to. Returns whether it was linked.
    pub async fn unlink(&self, user: BridgedUserId) -> Result<bool> {
        if self.openchat.linked_user_id(user).await?.is_none() {
            return Ok(false);
        }
        self.openchat.unlink(user).await?;
        Ok(true)
    }

    /// The OpenChat user the platform account is linked to, if any
    pub async fn linked_user(&self, user: BridgedUserId) -> Result<Option<LinkedUser>> {
        self.openchat.linked_user(user).await
    }

    // From OpenChat

    /// Handles a notification OpenChat sent to the bridge bot's `/notify` endpoint
    pub async fn handle_notification(&self, body: &[u8], signature: &str) -> NotificationOutcome {
        let wrapper = match BotEventWrapper::parse(body, signature, self.openchat.public_key()) {
            Ok(wrapper) => wrapper,
            Err(error) => {
                warn!(%error, "Invalid notification");
                return NotificationOutcome::Invalid;
            }
        };

        let key = (wrapper.api_gateway, wrapper.notification_index);
        let Some(_in_flight) = InFlight::start(&self.in_flight, key) else {
            // It's sent again while still being relayed, so it's retried once that's done
            return NotificationOutcome::Failed;
        };
        match self.store.notification_handled(key.0, key.1).await {
            Ok(true) => return NotificationOutcome::Handled,
            Ok(false) => {}
            Err(error) => {
                warn!(%error, "Failed to check whether a notification was handled");
                return NotificationOutcome::Failed;
            }
        }

        let timestamp = wrapper.timestamp;
        let result = match wrapper.event {
            BotEvent::Chat(event) => self.relay_outbound(event).await,
            BotEvent::Lifecycle(BotLifecycleEvent::Uninstalled(event)) => {
                self.uninstalled(event.location, timestamp).await
            }
            BotEvent::Community(_) | BotEvent::Lifecycle(_) => Ok(()),
        };
        if let Err(error) = result {
            if error.downcast_ref::<PermanentFailure>().is_none() {
                warn!(%error, "Failed to relay a notification, so OpenChat will retry it");
                return NotificationOutcome::Failed;
            }
            // Retrying won't help, and would hold up every other chat's notifications
            warn!(%error, "Failed to relay a notification");
        }

        if let Err(error) = self.store.mark_notification_handled(key.0, key.1).await {
            warn!(%error, "Failed to record a notification as handled");
        }
        NotificationOutcome::Handled
    }

    /// The bot was uninstalled from an OpenChat group or community, so its chats there which are
    /// paired are unpaired, and the platform chats are told
    async fn uninstalled(
        &self,
        location: InstallationLocation,
        uninstalled_at: TimestampMillis,
    ) -> Result<()> {
        let chats = match location {
            InstallationLocation::Group(id) => vec![Chat::Group(id)],
            InstallationLocation::Community(id) => self
                .store
                .paired_channels(id)
                .await?
                .into_iter()
                .map(|channel| Chat::Channel(id, channel))
                .collect(),
            InstallationLocation::User(_) => Vec::new(),
        };
        for chat in chats {
            if let Some(pairing) = self
                .store
                .pairing_for_oc_chat(&chat)
                .await?
                // Made once the bot was installed again, which OpenChat told the bridge of late.
                // An event without a timestamp is from an OpenChat which doesn't send one.
                .filter(|pairing| uninstalled_at == 0 || pairing.paired_at <= uninstalled_at)
            {
                // The bot can't post in the OpenChat chat any more, so only the platform chat's told
                self.store.remove_pairing(&pairing).await?;
                self.platform_unpaired(&pairing).await;
                info!(
                    platform_chat = pairing.platform_chat,
                    ?chat,
                    "Unpaired, as the bot was uninstalled"
                );
            }
        }
        Ok(())
    }

    /// Relays a new message, an edit or a deletion from an OpenChat chat to the platform chat it's
    /// paired with, if any
    async fn relay_outbound(&self, event: BotChatEvent) -> Result<()> {
        let ChatEvent::Message(message) = event.event else {
            return Ok(());
        };
        if !is_relayed(&message, event.thread.is_some(), P::PLATFORM) {
            return Ok(());
        }
        let Some(pairing) = self.store.pairing_for_oc_chat(&event.chat).await? else {
            return Ok(());
        };
        // Its own messages, eg. saying the chat is now bridged, are for OpenChat only. Looked up
        // once the chat's known to be paired, so a failed lookup only holds up bridged chats.
        if message.sender == self.openchat.bot_id().await? {
            return Ok(());
        }

        let chat = event.chat;
        let existing = self.store.outbound_ref(&chat, message.message_id).await?;
        let token_decimals = match transfer_ledger(&message.content) {
            Some(ledger) => self.openchat.token_decimals(ledger).await,
            None => None,
        };
        let text = message_text(&message.content, token_decimals);
        let hash = text.as_deref().map(content_hash);
        // A bot's message is posted once it's finished, by the edit which finalises it, which
        // isn't the chat's latest event if others were sent meanwhile
        let may_post =
            event.event_index == event.latest_event_index || message.bot_context().is_some();

        match outbound_action(hash, may_post, existing.as_ref()) {
            OutboundAction::Ignore => {}
            OutboundAction::Post => {
                let outbound = self
                    .outbound_message(&pairing, &message, text.unwrap_or_default())
                    .await?;
                let platform_message = match self.platform.post(&pairing, &outbound).await {
                    Ok(platform_message) => platform_message,
                    Err(error) => {
                        if matches!(
                            error.downcast_ref::<PermanentFailure>(),
                            Some(PermanentFailure::ChatGone)
                        ) {
                            warn!(platform_chat = pairing.platform_chat, "The chat is gone");
                            self.unpair(&pairing).await?;
                        }
                        return Err(error);
                    }
                };
                let outbound_ref = OutboundRef {
                    platform_message_id: platform_message.clone(),
                    content_hash: hash.unwrap_or_default(),
                };
                self.store
                    .save_outbound_ref(&chat, message.message_id, &outbound_ref)
                    .await?;
                // So replies to it, on either side, are relayed as replies
                let inbound_ref = InboundRef {
                    oc_chat: chat,
                    message_id: message.message_id,
                    event_index: Some(event.event_index),
                    from_openchat: true,
                };
                self.store
                    .save_inbound_ref(&pairing.platform_chat, &platform_message, inbound_ref)
                    .await?;
                self.store
                    .save_platform_message_at(
                        &chat,
                        event.event_index,
                        &pairing.platform_chat,
                        &platform_message,
                    )
                    .await?;
            }
            OutboundAction::Edit(platform_message) => {
                // The author too, as some platforms show it in the text
                let outbound = self
                    .outbound_message(&pairing, &message, text.unwrap_or_default())
                    .await?;
                self.platform
                    .edit(&pairing, &platform_message, &outbound)
                    .await?;
                let outbound_ref = OutboundRef {
                    platform_message_id: platform_message,
                    content_hash: hash.unwrap_or_default(),
                };
                self.store
                    .save_outbound_ref(&chat, message.message_id, &outbound_ref)
                    .await?;
            }
            OutboundAction::Delete(platform_message) => {
                self.platform.delete(&pairing, &platform_message).await?;
                self.store
                    .remove_outbound_ref(&chat, message.message_id)
                    .await?;
            }
        }
        Ok(())
    }

    async fn outbound_message(
        &self,
        pairing: &Pairing,
        message: &Message,
        text: String,
    ) -> Result<OutboundMessage> {
        let (author, via) = match message.bridged_from() {
            // Another bridge bot's message is shown as the account it relayed it from, or as the
            // OpenChat user who has linked that account, as OpenChat shows it
            Some(id) => match self.openchat.bridged_author(id).await {
                Some((author, summary)) => match summary.linked_user_id {
                    Some(linked_user_id) => match self.openchat.author(linked_user_id).await {
                        Some(linked) => (linked, None),
                        None => (author, Some(id.platform())),
                    },
                    None => (author, Some(id.platform())),
                },
                None => (self.unknown_author(), Some(id.platform())),
            },
            None => (
                self.openchat
                    .author(message.sender)
                    .await
                    .unwrap_or_else(|| self.unknown_author()),
                None,
            ),
        };

        let mut text = text;
        for user_id in mentioned_user_ids(&text) {
            if let Some(mentioned) = self.openchat.author(user_id).await {
                text = text.replace(
                    &format!("@UserId({user_id})"),
                    &format!("@{}", mentioned.name),
                );
            }
        }

        let reply_to = match &message.replies_to {
            Some(reply) if reply.chat_if_other.is_none() => {
                self.store
                    .platform_message_at(
                        &pairing.oc_chat,
                        reply.event_index,
                        &pairing.platform_chat,
                    )
                    .await?
            }
            _ => None,
        };

        Ok(OutboundMessage {
            author,
            via,
            text,
            reply_to,
        })
    }

    fn unknown_author(&self) -> Author {
        Author {
            name: "OpenChat user".to_string(),
            avatar_url: None,
        }
    }
}

// Removes a notification from those in flight once it's no longer being relayed
struct InFlight<'a> {
    set: &'a Mutex<HashSet<(CanisterId, u64)>>,
    key: (CanisterId, u64),
}

impl<'a> InFlight<'a> {
    fn start(set: &'a Mutex<HashSet<(CanisterId, u64)>>, key: (CanisterId, u64)) -> Option<Self> {
        // Built only if the key wasn't there, as dropping one removes its key
        let inserted = set.lock().unwrap().insert(key);
        inserted.then(|| InFlight { set, key })
    }
}

impl Drop for InFlight<'_> {
    fn drop(&mut self) {
        self.set.lock().unwrap().remove(&self.key);
    }
}

// The bridge's own relays come back to it. Only it can relay messages from its platform, so those
// are its own. Threads aren't bridged yet, nor messages a bot is still writing.
fn is_relayed(message: &Message, in_thread: bool, platform: BridgePlatform) -> bool {
    message
        .bridged_from()
        .is_none_or(|id| id.platform() != platform)
        && !in_thread
        && message
            .bot_context()
            .is_none_or(|context| context.finalised)
}

#[derive(Debug, PartialEq)]
enum OutboundAction {
    Ignore,
    Post,
    Edit(PlatformMessageId),
    Delete(PlatformMessageId),
}

// What a notification of an OpenChat message means for its copy on the platform, given the hash of
// its text (None if it was deleted), whether it may be posted if it has no copy, and its copy, if
// it has one
fn outbound_action(
    hash: Option<u64>,
    may_post: bool,
    existing: Option<&OutboundRef>,
) -> OutboundAction {
    match (hash, existing) {
        (None, Some(existing)) => OutboundAction::Delete(existing.platform_message_id.clone()),
        (None, None) => OutboundAction::Ignore,
        (Some(_), None) if may_post => OutboundAction::Post,
        // Edited, but sent before the chat was paired, so never relayed
        (Some(_), None) => OutboundAction::Ignore,
        // Its text didn't change, eg. only its link previews were edited
        (Some(hash), Some(existing)) if existing.content_hash == hash => OutboundAction::Ignore,
        (Some(_), Some(existing)) => OutboundAction::Edit(existing.platform_message_id.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ic_agent::export::Principal;
    use oc_bots_sdk::types::{
        BotMessageContext, MessageContent, SenderContext, TextContent, UserId,
    };

    fn message(sender_context: Option<SenderContext>) -> Message {
        let sender: UserId = Principal::from_slice(&[2]).into();
        Message {
            message_index: 1,
            message_id: 7.into(),
            sender,
            content: MessageContent::Text(TextContent {
                text: "hello".to_string(),
            }),
            sender_context,
            replies_to: None,
            reactions: Vec::new(),
            tips: Vec::new(),
            thread_summary: None,
            edited: false,
            forwarded: false,
            block_level_markdown: false,
            og_previews: Vec::new(),
        }
    }

    fn bot(finalised: bool, bridged_from: Option<BridgedUserId>) -> Option<SenderContext> {
        Some(SenderContext::Bot(BotMessageContext {
            command: None,
            finalised,
            bridged_from,
        }))
    }

    #[test]
    fn the_bridges_own_relays_threads_and_unfinished_messages_arent_relayed() {
        let discord = BridgePlatform::Discord;

        assert!(is_relayed(&message(None), false, discord));
        // Its own relay of a Discord message
        assert!(!is_relayed(
            &message(bot(true, Some(BridgedUserId::Discord(1)))),
            false,
            discord
        ));
        // Another bridge's
        assert!(is_relayed(
            &message(bot(true, Some(BridgedUserId::Telegram(1)))),
            false,
            discord
        ));
        assert!(!is_relayed(&message(None), true, discord));
        assert!(is_relayed(&message(bot(true, None)), false, discord));
        assert!(!is_relayed(&message(bot(false, None)), false, discord));
    }

    #[test]
    fn notifications_post_edit_or_delete_the_copy() {
        let copy = OutboundRef {
            platform_message_id: "99".to_string(),
            content_hash: 5,
        };

        assert_eq!(outbound_action(Some(5), true, None), OutboundAction::Post);
        // Edited, but sent before the chat was paired
        assert_eq!(
            outbound_action(Some(5), false, None),
            OutboundAction::Ignore
        );
        // Only its link previews changed
        assert_eq!(
            outbound_action(Some(5), false, Some(&copy)),
            OutboundAction::Ignore
        );
        assert_eq!(
            outbound_action(Some(6), false, Some(&copy)),
            OutboundAction::Edit("99".to_string())
        );
        assert_eq!(
            outbound_action(None, false, Some(&copy)),
            OutboundAction::Delete("99".to_string())
        );
        assert_eq!(outbound_action(None, false, None), OutboundAction::Ignore);
    }

    #[test]
    fn a_notification_is_in_flight_until_its_guard_is_dropped() {
        let set = Mutex::default();
        let key = (Principal::anonymous().into(), 1);

        let first = InFlight::start(&set, key);
        assert!(first.is_some());
        assert!(InFlight::start(&set, key).is_none());
        // Refusing a repeat leaves the first's key in place
        assert!(InFlight::start(&set, key).is_none());
        drop(first);
        assert!(InFlight::start(&set, key).is_some());
    }
}
