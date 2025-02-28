use crate::discord::{Context, Error};
use crate::shared::{OcChannelKey, RelayLink};
use oc_bots_sdk::types::TokenError;
use tracing::{error, info};

// Set OC token for the channel!
//
// Token is required to send messages to the OpenChat API. Token is stored
// specifically for the Discord channel providing it, so you can have different
// tokens if you'd like to use the bot in multiple Discord channels.
#[poise::command(slash_command)]
pub async fn set_oc_token(
    ctx: Context<'_>,
    #[description = "OpenChat token used to proxy messages to the OpenChat API"] token: String,
) -> Result<(), Error> {
    // If token is invalid, this will fail
    // TODO should we only allow 1:1 Ds to Oc channel message relaying?
    let reply = match OcChannelKey::from_api_key(token.clone()) {
        Ok(key) => {
            let relay_link = RelayLink::new(ctx.channel_id(), key, token);

            ctx.data()
                .state
                .set_relay_link(ctx.channel_id(), relay_link)
                .await?;

            info!("Relay link initialised for channel :: {}", ctx.channel_id());
            "OpenChat API token set!"
        }
        Err(err) => {
            error!(
                "Failed to set OpenChat API token for Discord channel :: {:?}",
                err
            );
            match err {
                TokenError::Invalid(_) => "Token is not valid!",
                TokenError::Expired => "Token has expired!",
            }
        }
    };

    ctx.send(poise::CreateReply::default().ephemeral(true).content(reply))
        .await?;

    Ok(())
}

/// Returns status for the channel!
///
/// If OC token is not provided status will return a message about it, or it will
/// provide some stats about the messages processed.
#[poise::command(slash_command)]
pub async fn status(ctx: Context<'_>) -> Result<(), Error> {
    let relay_link = ctx.data().state.get_relay_link(ctx.channel_id()).await;

    let process_status = || match relay_link {
        Some(RelayLink { error, .. }) => {
            if let Some(reason) = error {
                format!(
                    "OpenChat token is set for this channel, but message relay failed: {}",
                    reason
                )
            } else {
                "OpenChat token is set for this channel!".to_string()
            }
        }
        None => "OpenChat token is not set! Please use the `/set_oc_token` command to set it."
            .to_string(),
    };

    ctx.send(
        poise::CreateReply::default()
            .ephemeral(true)
            .content(process_status()),
    )
    .await?;
    Ok(())
}
