use crate::discord::{types::ChannelStatus, Error, FrameworkContext, LocalData};
use crate::openchat::RelayMessage;
use poise::serenity_prelude as serenity;
use serenity::Message;
use tracing::{debug, error, info, warn};

pub async fn event_handler(
    ctx: &serenity::Context,
    event: &serenity::FullEvent,
    _framework: FrameworkContext<'_>,
    data: &LocalData,
) -> Result<(), Error> {
    match event {
        serenity::FullEvent::Ready { data_about_bot, .. } => {
            info!(data_about_bot.user.name, "Ready to process Discord events");
        }
        serenity::FullEvent::Message { new_message } => {
            proxy_message(ctx, new_message, data).await?
        }
        _ => {}
    }

    Ok(())
}

// Proxies/relays messages from Discord to OpenChat
//
// Note: threads in Discord are treated as new channels, seemingly separate
// from the main channel, making them more difficult to relay.
async fn proxy_message(
    ctx: &serenity::Context,
    new_message: &Message,
    data: &LocalData,
) -> Result<(), Error> {
    // Any message that the bot might send to the channel, will also be
    // returned as a message event.
    let not_bot_itself = new_message.author.id != ctx.cache.current_user().id;

    if not_bot_itself {
        // Attachments will hold any image/video/other that is sent with a message.
        // We are filtering out messages with no content and attachments.
        // TODO allow attachments to be sent to OpenChat
        if new_message.content.is_empty() && !new_message.attachments.is_empty() {
            warn!(
                new_message.author.name,
                "Unsupported messsage type - attachments are not yet handled!"
            );
            return Ok(());
        }

        // Get OC destination channel token!
        let channel_id = new_message.channel_id;
        let oc_token = data.state.get_token_for_oc_channel(channel_id).await;

        debug!("Relaying message :: {:?}", new_message);

        if let Some(token) = oc_token {
            // Broadcast message, to be picked up by the OC agent!
            let res = data
                .tx
                .send(RelayMessage::from_message(new_message.clone(), token))
                .await;

            // TODO: a recovery mechanism?
            if let Err(e) = res {
                error!("Failed to send message to OC :: {}", e);
                data.state
                    .set_status_for_ds_channel(
                        channel_id,
                        ChannelStatus::ProxyFailed("Failed to send message to OC".to_string()),
                    )
                    .await?;
            }
        } else {
            // TODO figure out how to get channel name
            info!(
                "Cannot proxy message, OpenChat token is not set for Discord channel with id :: {}",
                new_message.channel_id
            );
            data.state
                .set_status_for_ds_channel(channel_id, ChannelStatus::TokenNotSet)
                .await?;
        }

        // This is just for fun!
        if new_message.content.to_lowercase().contains("ping") {
            new_message
                .reply(ctx, "You've mentioned a ping! Here's a pong!")
                .await?;
        }
    }

    Ok(())
}
