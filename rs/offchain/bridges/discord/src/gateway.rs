use crate::webhook::{Discord, DiscordPairing};
use anyhow::{Context as _, Result};
use oc_bots_sdk::types::{BridgedUser, BridgedUserId, DiscordUser};
use oc_bridge_core::{Bridge, InboundMessage, PendingPairing};
use secrecy::ExposeSecret;
use serenity::all::{
    Attachment, ChannelId, Command, CommandInteraction, Context, CreateCommand, CreateWebhook,
    EditInteractionResponse, EventHandler, GuildId, Interaction, Message, MessageId, MessageType,
    MessageUpdateEvent, Permissions, Ready, StickerItem, User,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use tracing::{info, warn};

/// Relays what happens in Discord's paired channels into OpenChat, and handles the bridge's slash
/// commands
pub struct Handler {
    pub bridge: Arc<Bridge<Discord>>,
    // Its webhooks' messages are the ones it relayed from OpenChat
    application_id: OnceLock<u64>,
    // Discord's events are handled concurrently, so each channel's are handled in turn, keeping
    // its messages in order
    channel_locks: Mutex<HashMap<ChannelId, Arc<tokio::sync::Mutex<()>>>>,
}

impl Handler {
    pub fn new(bridge: Arc<Bridge<Discord>>) -> Self {
        Handler {
            bridge,
            application_id: OnceLock::new(),
            channel_locks: Mutex::default(),
        }
    }

    fn channel_lock(&self, channel_id: ChannelId) -> Arc<tokio::sync::Mutex<()>> {
        self.channel_locks
            .lock()
            .unwrap()
            .entry(channel_id)
            .or_default()
            .clone()
    }

    fn is_from_bridge(&self, ctx: &Context, author: &User, application_id: Option<u64>) -> bool {
        author.id == ctx.cache.current_user().id
            || application_id.is_some_and(|id| Some(&id) == self.application_id.get())
    }

    async fn relay(&self, ctx: &Context, message: Message) -> Result<()> {
        let application_id = message.application_id.map(|id| id.get());
        if self.is_from_bridge(ctx, &message.author, application_id)
            || !matches!(
                message.kind,
                MessageType::Regular | MessageType::InlineReply
            )
        {
            return Ok(());
        }

        let lock = self.channel_lock(message.channel_id);
        let _guard = lock.lock().await;
        self.bridge
            .relay_inbound(InboundMessage {
                platform_chat: message.channel_id.to_string(),
                platform_message: message.id.to_string(),
                author: bridged_user(&message.author),
                text: inbound_text(
                    &message.content,
                    &message.mentions,
                    &message.attachments,
                    &message.sticker_items,
                ),
                reply_to: message
                    .message_reference
                    .and_then(|r| r.message_id)
                    .map(|id| id.to_string()),
            })
            .await
    }

    async fn relay_edit(&self, ctx: &Context, event: MessageUpdateEvent) -> Result<()> {
        // Discord also sends updates which don't change the text, eg. when it adds an embed
        let Some(content) = event.content else {
            return Ok(());
        };
        if let Some(author) = &event.author
            && self.is_from_bridge(
                ctx,
                author,
                event.application_id.flatten().map(|id| id.get()),
            )
        {
            return Ok(());
        }

        let text = inbound_text(
            &content,
            event.mentions.as_deref().unwrap_or_default(),
            event.attachments.as_deref().unwrap_or_default(),
            event.sticker_items.as_deref().unwrap_or_default(),
        );
        let lock = self.channel_lock(event.channel_id);
        let _guard = lock.lock().await;
        self.bridge
            .relay_inbound_edit(&event.channel_id.to_string(), &event.id.to_string(), text)
            .await
    }

    async fn relay_delete(&self, channel_id: ChannelId, message_id: MessageId) -> Result<()> {
        let lock = self.channel_lock(channel_id);
        let _guard = lock.lock().await;
        self.bridge
            .relay_inbound_delete(&channel_id.to_string(), &message_id.to_string())
            .await
    }

    async fn command(&self, ctx: &Context, command: &CommandInteraction) -> Result<String> {
        Ok(match command.data.name.as_str() {
            "bridge" => {
                let guild_id = command.guild_id.context("/bridge only works in a server")?;
                let webhook = command
                    .channel_id
                    .create_webhook(&ctx.http, CreateWebhook::new("OpenChat"))
                    .await
                    .context("Failed to create a webhook. Does the bot have Manage Webhooks?")?;
                let platform_data = DiscordPairing {
                    guild_id: guild_id.get(),
                    webhook_id: webhook.id.get(),
                    webhook_token: webhook
                        .token
                        .context("The webhook has no token")?
                        .expose_secret()
                        .clone(),
                };
                let code = self
                    .bridge
                    .start_pairing(&PendingPairing {
                        platform_chat: command.channel_id.to_string(),
                        name: channel_name(ctx, command.channel_id, guild_id).await,
                        platform_data: Some(serde_json::to_string(&platform_data)?),
                    })
                    .await?;
                format!(
                    "In the OpenChat group or public channel to bridge with this channel, install \
                    the bridge bot, then run `/bridge {code}` there within 15 minutes."
                )
            }
            "unbridge" => {
                if self
                    .bridge
                    .unpair_platform_chat(&command.channel_id.to_string())
                    .await?
                {
                    "This channel is no longer bridged with OpenChat.".to_string()
                } else {
                    "This channel isn't bridged with OpenChat.".to_string()
                }
            }
            "link" => "To link your Discord account, open your profile in OpenChat, then choose \
                Link Discord under Linked accounts."
                .to_string(),
            "unlink" => {
                self.bridge
                    .unlink(BridgedUserId::Discord(command.user.id.get()))
                    .await?;
                "Your Discord account is no longer linked to an OpenChat account.".to_string()
            }
            _ => "Unknown command".to_string(),
        })
    }
}

#[serenity::async_trait]
impl EventHandler for Handler {
    async fn ready(&self, ctx: Context, ready: Ready) {
        let _ = self.application_id.set(ready.application.id.get());
        let manage = Permissions::MANAGE_CHANNELS | Permissions::MANAGE_WEBHOOKS;
        let commands = vec![
            CreateCommand::new("bridge")
                .description("Bridge this channel with an OpenChat group or channel")
                .default_member_permissions(manage)
                .dm_permission(false),
            CreateCommand::new("unbridge")
                .description("Stop bridging this channel with OpenChat")
                .default_member_permissions(manage)
                .dm_permission(false),
            CreateCommand::new("link").description("Link your Discord account to OpenChat"),
            CreateCommand::new("unlink")
                .description("Unlink your Discord account from your OpenChat account"),
        ];
        if let Err(error) = Command::set_global_commands(&ctx.http, commands).await {
            warn!(?error, "Failed to register the slash commands");
        }
        info!(user = ready.user.name, "Connected to Discord");
    }

    async fn message(&self, ctx: Context, message: Message) {
        let id = message.id;
        if let Err(error) = self.relay(&ctx, message).await {
            warn!(?error, %id, "Failed to relay a message");
        }
    }

    async fn message_update(
        &self,
        ctx: Context,
        _old: Option<Message>,
        _new: Option<Message>,
        event: MessageUpdateEvent,
    ) {
        let id = event.id;
        if let Err(error) = self.relay_edit(&ctx, event).await {
            warn!(?error, %id, "Failed to relay an edit");
        }
    }

    async fn message_delete(
        &self,
        _ctx: Context,
        channel_id: ChannelId,
        message_id: MessageId,
        _guild_id: Option<GuildId>,
    ) {
        if let Err(error) = self.relay_delete(channel_id, message_id).await {
            warn!(?error, %message_id, "Failed to relay a deletion");
        }
    }

    async fn message_delete_bulk(
        &self,
        _ctx: Context,
        channel_id: ChannelId,
        message_ids: Vec<MessageId>,
        _guild_id: Option<GuildId>,
    ) {
        for message_id in message_ids {
            if let Err(error) = self.relay_delete(channel_id, message_id).await {
                warn!(?error, %message_id, "Failed to relay a deletion");
            }
        }
    }

    async fn interaction_create(&self, ctx: Context, interaction: Interaction) {
        let Interaction::Command(command) = interaction else {
            return;
        };
        // Answered within Discord's 3 seconds, then completed
        if let Err(error) = command.defer_ephemeral(&ctx.http).await {
            warn!(?error, "Failed to answer a command");
            return;
        }
        let reply = match self.command(&ctx, &command).await {
            Ok(reply) => reply,
            Err(error) => {
                warn!(?error, command = command.data.name, "Command failed");
                format!("Something went wrong: {error}")
            }
        };
        if let Err(error) = command
            .edit_response(&ctx.http, EditInteractionResponse::new().content(reply))
            .await
        {
            warn!(?error, "Failed to reply to a command");
        }
    }
}

async fn channel_name(ctx: &Context, channel_id: ChannelId, guild_id: GuildId) -> String {
    let channel = channel_id
        .name(&ctx)
        .await
        .map_or_else(|_| "this channel".to_string(), |name| format!("#{name}"));
    match guild_id.name(&ctx.cache) {
        Some(guild) => format!("{channel} in {guild}"),
        None => channel,
    }
}

pub fn bridged_user(user: &User) -> BridgedUser {
    BridgedUser::Discord(DiscordUser {
        id: user.id.get(),
        username: user.name.clone(),
        display_name: user.global_name.clone(),
        avatar: user.avatar.map(|hash| hash.to_string()),
    })
}

/// A Discord message's text as it's relayed into OpenChat. Mentions are written as `@name`,
/// custom emoji as `:name:`, and attachments and stickers are added.
pub fn inbound_text(
    content: &str,
    mentions: &[User],
    attachments: &[Attachment],
    stickers: &[StickerItem],
) -> String {
    let mut text = content.to_string();
    for user in mentions {
        let name = user.global_name.as_deref().unwrap_or(&user.name);
        for mention in [format!("<@{}>", user.id), format!("<@!{}>", user.id)] {
            text = text.replace(&mention, &format!("@{name}"));
        }
    }
    text = custom_emoji_as_names(&text);

    // Discord's attachment links expire after a while
    for attachment in attachments {
        text.push_str(&format!("\n[{}]({})", attachment.filename, attachment.url));
    }
    for sticker in stickers {
        text.push_str(&format!("\n[Sticker: {}]", sticker.name));
    }
    text.trim().to_string()
}

// `<:name:id>` and `<a:name:id>` become `:name:`
fn custom_emoji_as_names(text: &str) -> String {
    let mut result = String::new();
    let mut rest = text;
    while let Some(start) = rest.find('<') {
        result.push_str(&rest[..start]);
        let candidate = &rest[start..];
        let parsed = candidate.find('>').and_then(|end| {
            let inner = &candidate[1..end];
            let inner = inner.strip_prefix('a').unwrap_or(inner);
            let (name, id) = inner.strip_prefix(':')?.split_once(':')?;
            (!name.is_empty() && !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()))
                .then(|| (format!(":{name}:"), end + 1))
        });
        match parsed {
            Some((emoji, length)) => {
                result.push_str(&emoji);
                rest = &candidate[length..];
            }
            None => {
                result.push('<');
                rest = &candidate[1..];
            }
        }
    }
    result.push_str(rest);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_emoji_become_their_names() {
        assert_eq!(
            custom_emoji_as_names("hi <:wave:123> and <a:party:456>!"),
            "hi :wave: and :party:!"
        );
        assert_eq!(
            custom_emoji_as_names("a < b > c <@123>"),
            "a < b > c <@123>"
        );
    }
}
