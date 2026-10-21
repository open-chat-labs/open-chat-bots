use crate::model::PlatformMessageId;
use crate::model::{BridgeStore, InboundRef, OutboundRef, Pairing, PendingPairing};
use crate::openchat::{Author, LinkedUser, OpenChat};
use crate::platform::{InboundMessage, OutboundMessage, Platform};
use crate::util::{content_hash, inbound_message_id, mentioned_user_ids, message_text};
use anyhow::Result;
use oc_bots_sdk::api::event_notification::{BotChatEvent, BotEvent, BotEventWrapper};
use oc_bots_sdk::types::{BridgedUser, BridgedUserId, Chat, ChatEvent, Message, UserId};
use tracing::{info, warn};

/// What came of a notification from OpenChat, as the HTTP status to answer it with
#[derive(Debug, PartialEq, Eq)]
pub enum NotificationOutcome {
    Handled,
    /// It wasn't signed by OpenChat or couldn't be decoded, so OpenChat shouldn't retry it
    Invalid,
    /// Relaying it failed, eg. the platform was unavailable, so OpenChat should retry it
    Failed,
}

/// A bridge between OpenChat and one platform
pub struct Bridge<P> {
    pub openchat: OpenChat,
    pub store: BridgeStore,
    pub platform: P,
}

impl<P: Platform> Bridge<P> {
    pub fn new(openchat: OpenChat, store: BridgeStore, platform: P) -> Self {
        Bridge {
            openchat,
            store,
            platform,
        }
    }

    // From the platform

    /// Relays a message from the platform into the OpenChat chat its chat is paired with, if any
    pub async fn relay_inbound(&self, message: InboundMessage) -> Result<()> {
        let Some(pairing) = self.store.pairing(&message.platform_chat).await? else {
            return Ok(());
        };
        if message.text.trim().is_empty() {
            return Ok(());
        }

        let replies_to = match &message.reply_to {
            Some(reply_to) => self
                .store
                .inbound_ref(&message.platform_chat, reply_to)
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

        self.store
            .save_inbound_ref(
                &message.platform_chat,
                &message.platform_message,
                InboundRef {
                    message_id,
                    event_index,
                    from_openchat: false,
                },
            )
            .await?;
        if let Some(event_index) = event_index {
            self.store
                .save_platform_message_at(&pairing.oc_chat, event_index, &message.platform_message)
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
        let Some(inbound) = self
            .store
            .inbound_ref(platform_chat, platform_message)
            .await?
        else {
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
            .store
            .inbound_ref(platform_chat, platform_message)
            .await?
            .filter(|inbound| !inbound.from_openchat)
        else {
            return Ok(());
        };
        self.openchat.delete(&pairing, inbound.message_id).await
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

    pub async fn unpair(&self, pairing: &Pairing) -> Result<()> {
        self.store.remove_pairing(pairing).await?;
        if let Err(error) = self.platform.unpaired(pairing).await {
            warn!(?error, "Failed to clean up after unpairing");
        }
        info!(platform_chat = pairing.platform_chat, "Unpaired");
        Ok(())
    }

    /// Pairs the OpenChat chat with the platform chat `code` was given for. A chat paired already,
    /// on either side, is unpaired first. Returns the platform chat's name, or None if the code is
    /// unknown or has expired.
    pub async fn complete_pairing(
        &self,
        code: &str,
        oc_chat: Chat,
        api_gateway: oc_bots_sdk::types::CanisterId,
    ) -> Result<Option<String>> {
        let Some(pending) = self.store.take_pending_pairing(code).await? else {
            return Ok(None);
        };

        if let Some(existing) = self.store.pairing(&pending.platform_chat).await? {
            self.unpair(&existing).await?;
        }
        if let Some(existing) = self.store.pairing_for_oc_chat(&oc_chat).await? {
            self.unpair(&existing).await?;
        }

        let pairing = Pairing {
            platform_chat: pending.platform_chat,
            oc_chat,
            api_gateway,
            platform_data: pending.platform_data,
        };
        self.store.save_pairing(&pairing).await?;
        if let Err(error) = self.platform.paired(&pairing).await {
            warn!(?error, "Failed to announce the pairing");
        }
        info!(platform_chat = pairing.platform_chat, ?oc_chat, "Paired");
        Ok(Some(pending.name))
    }

    /// Links the platform account to the OpenChat user who was given `code` from their profile
    pub async fn link(&self, user: BridgedUser, code: String) -> Result<LinkedUser> {
        self.openchat.link(user, code).await
    }

    pub async fn unlink(&self, user: BridgedUserId) -> Result<()> {
        self.openchat.unlink(user).await
    }

    // From OpenChat

    /// Handles a notification OpenChat sent to the bridge bot's `/notify` endpoint
    pub async fn handle_notification(&self, body: &[u8], signature: &str) -> NotificationOutcome {
        let wrapper = match BotEventWrapper::parse(body, signature, self.openchat.public_key()) {
            Ok(wrapper) => wrapper,
            Err(error) => {
                warn!(?error, "Invalid notification");
                return NotificationOutcome::Invalid;
            }
        };

        let (api_gateway, index) = (wrapper.api_gateway, wrapper.notification_index);
        match self.store.notification_handled(api_gateway, index).await {
            Ok(true) => return NotificationOutcome::Handled,
            Ok(false) => {}
            Err(error) => {
                warn!(?error, "Failed to check whether a notification was handled");
                return NotificationOutcome::Failed;
            }
        }

        let result = match wrapper.event {
            BotEvent::Chat(event) => self.relay_outbound(event).await,
            BotEvent::Community(_) | BotEvent::Lifecycle(_) => Ok(()),
        };
        if let Err(error) = result {
            warn!(?error, "Failed to relay a notification");
            return NotificationOutcome::Failed;
        }

        if let Err(error) = self
            .store
            .mark_notification_handled(api_gateway, index)
            .await
        {
            warn!(?error, "Failed to record a notification as handled");
        }
        NotificationOutcome::Handled
    }

    /// Relays a new message, an edit or a deletion from an OpenChat chat to the platform chat it's
    /// paired with, if any
    async fn relay_outbound(&self, event: BotChatEvent) -> Result<()> {
        let ChatEvent::Message(message) = event.event else {
            return Ok(());
        };
        if !is_relayed(&message, event.thread.is_some(), self.openchat.bot_id()) {
            return Ok(());
        }
        let Some(pairing) = self.store.pairing_for_oc_chat(&event.chat).await? else {
            return Ok(());
        };

        let chat = event.chat;
        let existing = self.store.outbound_ref(&chat, message.message_id).await?;
        let text = message_text(&message.content);
        let hash = text.as_deref().map(content_hash);
        let is_new = event.event_index == event.latest_event_index;

        match outbound_action(hash, is_new, existing.as_ref()) {
            OutboundAction::Ignore => {}
            OutboundAction::Post => {
                let outbound = self
                    .outbound_message(&chat, &message, text.unwrap_or_default())
                    .await?;
                let platform_message = self.platform.post(&pairing, &outbound).await?;
                let outbound_ref = OutboundRef {
                    platform_message_id: platform_message.clone(),
                    content_hash: hash.unwrap_or_default(),
                };
                self.store
                    .save_outbound_ref(&chat, message.message_id, &outbound_ref)
                    .await?;
                // So replies to it, on either side, are relayed as replies
                let inbound_ref = InboundRef {
                    message_id: message.message_id,
                    event_index: Some(event.event_index),
                    from_openchat: true,
                };
                self.store
                    .save_inbound_ref(&pairing.platform_chat, &platform_message, inbound_ref)
                    .await?;
                self.store
                    .save_platform_message_at(&chat, event.event_index, &platform_message)
                    .await?;
            }
            OutboundAction::Edit(platform_message) => {
                let outbound = self
                    .outbound_message(&chat, &message, text.unwrap_or_default())
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
        chat: &Chat,
        message: &Message,
        text: String,
    ) -> Result<OutboundMessage> {
        // Another bridge bot's message is shown as the account it relayed it from
        let (author, via) = match message.bridged_from() {
            Some(id) => match self.openchat.bridged_author(id).await {
                Some((author, _)) => (author, Some(id.platform())),
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
                    .platform_message_at(chat, reply.event_index)
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

// The bridge's own messages come back to it. Threads aren't bridged yet, nor messages a bot is
// still writing.
fn is_relayed(message: &Message, in_thread: bool, bot_id: UserId) -> bool {
    message.sender != bot_id
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
// its text (None if it was deleted), whether it's a new message, and its copy, if it has one
fn outbound_action(
    hash: Option<u64>,
    is_new: bool,
    existing: Option<&OutboundRef>,
) -> OutboundAction {
    match (hash, existing) {
        (None, Some(existing)) => OutboundAction::Delete(existing.platform_message_id.clone()),
        (None, None) => OutboundAction::Ignore,
        (Some(_), None) if is_new => OutboundAction::Post,
        // Edited or reacted to, but sent before the chat was paired, so never relayed
        (Some(_), None) => OutboundAction::Ignore,
        // A reaction or tip, which aren't relayed
        (Some(hash), Some(existing)) if existing.content_hash == hash => OutboundAction::Ignore,
        (Some(_), Some(existing)) => OutboundAction::Edit(existing.platform_message_id.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ic_agent::export::Principal;
    use oc_bots_sdk::types::{BotMessageContext, MessageContent, SenderContext, TextContent};

    fn message(sender: UserId, sender_context: Option<SenderContext>) -> Message {
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

    #[test]
    fn the_bridges_own_threads_and_unfinished_messages_arent_relayed() {
        let bot: UserId = Principal::from_slice(&[1]).into();
        let user: UserId = Principal::from_slice(&[2]).into();
        let other_bot = |finalised| {
            Some(SenderContext::Bot(BotMessageContext {
                command: None,
                finalised,
                bridged_from: None,
            }))
        };

        assert!(is_relayed(&message(user, None), false, bot));
        assert!(!is_relayed(&message(bot, None), false, bot));
        assert!(!is_relayed(&message(user, None), true, bot));
        assert!(is_relayed(&message(user, other_bot(true)), false, bot));
        assert!(!is_relayed(&message(user, other_bot(false)), false, bot));
    }

    #[test]
    fn notifications_post_edit_or_delete_the_copy() {
        let copy = OutboundRef {
            platform_message_id: "99".to_string(),
            content_hash: 5,
        };

        assert_eq!(outbound_action(Some(5), true, None), OutboundAction::Post);
        // Sent before the chat was paired
        assert_eq!(
            outbound_action(Some(5), false, None),
            OutboundAction::Ignore
        );
        // A reaction
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
}
