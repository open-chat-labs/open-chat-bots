use crate::discord::{types::ChannelStatus, Context, Error};
use crate::openchat::OcToken;
use tracing::info;

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
    ctx.data()
        .state
        .set_token_for_oc_channel(ctx.channel_id(), OcToken(token))
        .await?;
    ctx.data()
        .state
        .set_status_for_ds_channel(ctx.channel_id(), ChannelStatus::Operational)
        .await?;
    ctx.send(
        poise::CreateReply::default()
            .ephemeral(true)
            .content("OC token set!"),
    )
    .await?;

    info!("OC token set for channel :: {}", ctx.channel_id());
    Ok(())
}

/// Returns status for the channel!
///
/// If OC token is not provided status will return a message about it, or it will
/// provide some stats about the messages processed.
#[poise::command(slash_command)]
pub async fn status(ctx: Context<'_>) -> Result<(), Error> {
    let channel_status = ctx
        .data()
        .state
        .get_status_for_ds_channel(ctx.channel_id())
        .await;
    let msg = (|| match channel_status {
        Some(status) => {
            match status {
                ChannelStatus::TokenNotSet => {
                    format!("OpenChat token is not set! Please use the `/set_oc_token` command to set it.")
                }
                ChannelStatus::Operational => {
                    format!("OC token is set for this channel!")
                }
                ChannelStatus::ProxyFailed(reason) => {
                    format!(
                        "OC token is set for this channel, but proxy failed: {}",
                        reason
                    )
                }
            }
        }
        None => {
            format!("I don't have a status for you yet, bot hasn't been used.")
        }
    })();

    ctx.send(poise::CreateReply::default().ephemeral(true).content(msg))
        .await?;
    Ok(())
}
