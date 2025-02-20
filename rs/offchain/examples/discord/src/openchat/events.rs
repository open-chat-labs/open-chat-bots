use crate::discord::types::ChannelStatus;
use crate::errors::BotError;
use crate::openchat::OcData;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::types::{AuthToken, BotApiKeyContext, MessageContent, TextContent};
use oc_bots_sdk_offchain::env;
use poise::serenity_prelude::Message;
use std::sync::Arc;
use tokio::sync::mpsc::Receiver;
use tracing::{error, info};

pub async fn handle_openchat_events(
    data: Arc<OcData>,
    mut rx: Receiver<Message>,
) -> Result<(), BotError> {
    info!("Awaiting for Discord messages");

    while let Some(message) = rx.recv().await {
        // Get token for the channel in which the message was sent!
        let oc_api_token = data
            .state
            .get_token_for_oc_channel(message.channel_id)
            .await;

        // If the token is available!
        if let Some(api_token) = oc_api_token {
            let auth_token = AuthToken::ApiKey(api_token.0);

            info!(
                "Relay Discord message :: [{}] > {}",
                message.author.name, message.content
            );

            let author = format!("**[{}]** {}", message.author.name, message.content);
            let images: Vec<String> = message
                .attachments
                .into_iter()
                .filter_map(|attach| {
                    let content_type = attach.content_type.unwrap_or_default();
                    if content_type.starts_with("image/") {
                        Some(format!(
                            "🔗 [{}: {}]({})",
                            content_type, attach.filename, attach.url
                        ))
                    } else {
                        None
                    }
                })
                .collect();

            // TODO Can we recover if this fails? Could the context be clone-able?
            match BotApiKeyContext::parse(
                auth_token.clone(),
                &data.oc_config.public_key,
                env::now(),
            ) {
                Ok(ctx) => {
                    let text = [author, images.join("\n")].join("\n\n");

                    // TODO add recovery mechanism with backpressure for the request.
                    let res = data
                        .oc_client
                        .build_api_key_client(ctx)
                        .send_message(MessageContent::Text(TextContent { text }))
                        .execute_async()
                        .await;

                    let channel_status = if let Err(err) = res {
                        error!("Failed to send message to OC :: {:?}", err);
                        ChannelStatus::ProxyFailed(
                            "OpenChat bot could not push message to an OC channel.".to_string(),
                        )
                    } else {
                        ChannelStatus::Operational
                    };

                    data.state
                        .set_status_for_ds_channel(message.channel_id, channel_status)
                        .await?;
                }
                Err(err) => error!("Failed to obtain OC bot context :: {:?}", err),
            }
        } else {
            // TODO figure out how to get channel name
            info!(
                "Cannot proxy message, OpenChat token is not set for Discord channel with id :: {}",
                message.channel_id
            );
            data.state
                // TODO maybe the channel status is a common type
                .set_status_for_ds_channel(message.channel_id, ChannelStatus::TokenNotSet)
                .await?;
        }
    }

    Ok(())
}
