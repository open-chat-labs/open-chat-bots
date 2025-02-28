use crate::discord::{Error, FrameworkContext, LocalData};
use poise::serenity_prelude::{self as serenity, Message};
use tracing::{debug, error, info};

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
        debug!("Relaying message :: {:#?}", new_message);

        // Broadcast message, to be picked up by the OC agent!
        let res = data.tx.send(new_message.clone()).await;

        if let Err(e) = res {
            // TODO a recovery mechanism
            error!("Failed to push message to OC bot :: {}", e);

            if let Some(relay_link) = data.state.get_relay_link(new_message.channel_id).await {
                data.state
                    .set_relay_link(
                        new_message.channel_id,
                        // We'll reset this on the OC bot side!
                        relay_link
                            .set_error("Message did not reach OpenChat handler bot!".to_string()),
                    )
                    .await?;
            }
        }
    }

    Ok(())
}
