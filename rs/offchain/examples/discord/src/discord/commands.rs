use crate::discord::{Context, Error};
use crate::shared::{OcChannelKey, RelayLink};
use oc_bots_sdk::types::TokenError;
use tracing::{error, info, warn};

/// Connect to OC; set OC channel api key!
///
/// An api key is required to send messages to the OpenChat API. The api key is
/// provided directly to the bot using the `/connect` command, and is mapped to
/// the Discord channel where the command is called.
///
/// Api key enables relaying messages only to the OC channel which is the
/// "owner" of the key. If that key is regenerated on the OC side, relaying
/// won't work, and you will need to provide the api key again using this
/// command.
///
/// A single OC api key can be given to multiple Discord channels, therefore
/// aggregating messages from multiple Discord channels within a single OC
/// channel. A single Discord channel can only be linked to a single OC channel.
#[poise::command(slash_command)]
pub async fn connect(
    ctx: Context<'_>,
    #[description = "API key of the OpenChat channel where messages should be relayed."]
    api_key: String,
) -> Result<(), Error> {
    // If api key is invalid, this will fail
    // TODO should we only allow 1:1 Ds to Oc channel message relaying?
    let reply = match OcChannelKey::from_api_key(api_key.clone()) {
        Ok(oc_channel_key) => {
            let relay_link = RelayLink::new(ctx.channel_id(), oc_channel_key, api_key);

            ctx.data()
                .state
                .set_relay_link(ctx.channel_id(), relay_link)
                .await?;

            info!("Relay link initialised for channel :: {}", ctx.channel_id());
            "OpenChat API key set!"
        }
        Err(err) => {
            error!(
                "Failed to set OpenChat API key for Discord channel :: {:?}",
                err
            );
            match err {
                TokenError::Invalid(_) => "API key is not valid!",
                TokenError::Expired => "Provided token has expired!",
            }
        }
    };

    ctx.send(poise::CreateReply::default().ephemeral(true).content(reply))
        .await?;

    Ok(())
}

/// Clear OpenChat API key!
///
/// Removes the API key that was previously set for the channel. This will stop
/// messages from being relayed to the OpenChat API.
///
/// Use this command if you've set the wrong API key, or if you want to stop
/// relaying messages to the OpenChat.
#[poise::command(slash_command)]
pub async fn disconnect(ctx: Context<'_>) -> Result<(), Error> {
    let was_removed = ctx.data().state.remove_relay_link(ctx.channel_id()).await;
    let reply = if was_removed {
        info!("Relay link removed for channel :: {}", ctx.channel_id());
        "OpenChat API key cleared!"
    } else {
        warn!(
            "Attempted to clear the OC API key, but a key not set for Discord channel :: {}",
            ctx.channel_id()
        );
        "OpenChat API key was not set for this channel!"
    };

    ctx.send(poise::CreateReply::default().ephemeral(true).content(reply))
        .await?;

    Ok(())
}

/// Returns status for the channel!
///
/// This command checks if an OpenChat API key is set for the channel. If it is
/// set, it will return a message indicating that the key is set; or indicate
/// that the key is not set. If a message relay failed, it will also indicate
/// that, and provide some error context.
#[poise::command(slash_command)]
pub async fn status(ctx: Context<'_>) -> Result<(), Error> {
    let relay_link = ctx.data().state.get_relay_link(ctx.channel_id()).await;

    let process_status = || match relay_link {
        Some(RelayLink { error, .. }) => {
            if let Some(reason) = error {
                // TODO in high volume chats, this may get overwritten quickly.
                // We should consider a more robust way to store and display
                // errors. Perhaps a log, that can list last n errors?
                format!(
                    "OpenChat API key is set for this channel, but message relay failed: {}",
                    reason
                )
            } else {
                "OpenChat APi key is set for this channel!".to_string()
            }
        }
        None => {
            "OpenChat API key is not set! Please use the `/connect` command to set it.".to_string()
        }
    };

    ctx.send(
        poise::CreateReply::default()
            .ephemeral(true)
            .content(process_status()),
    )
    .await?;
    Ok(())
}
