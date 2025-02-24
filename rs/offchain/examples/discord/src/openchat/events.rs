use crate::discord::types::ChannelStatus;
use crate::errors::BotError;
use crate::openchat::OcData;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::types::{AuthToken, BotApiKeyContext, MessageContent, TextContent};
use oc_bots_sdk_offchain::env;
use poise::serenity_prelude::Message;
use std::sync::Arc;
use tokio::sync::mpsc::Receiver;
use tracing::{error, info, warn};

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
            let attachments: Vec<String> = message
                .attachments
                .into_iter()
                .filter_map(|attach| {
                    if let Some(content_type) = attach.content_type {
                        Some(format!(
                            "🔗 [{}: {}]({})",
                            content_type, attach.filename, attach.url
                        ))
                    } else {
                        None
                    }
                })
                .collect();

            let stickers: Vec<String> = message
                .sticker_items
                .into_iter()
                .map(|sticker| format!("📌 Sticker shared: {}", sticker.name))
                .collect();

            if !(message.content.is_empty() && attachments.is_empty() && stickers.is_empty()) {
                // TODO Can we recover if this fails? Could the context be clone-able?
                match BotApiKeyContext::parse(
                    auth_token.clone(),
                    &data.oc_config.public_key,
                    env::now(),
                ) {
                    Ok(ctx) => {
                        let text = [author, [attachments, stickers].concat().join("\n")]
                            .into_iter()
                            .filter(|v| !v.is_empty())
                            .collect::<Vec<String>>()
                            .join(if message.content.is_empty() {
                                "\n"
                            } else {
                                "\n\n"
                            });

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
                warn!(
                    "Discord message does not contain any data for relaying :: message.id {}",
                    message.id
                );
            }
        } else {
            // TODO figure out how to get channel name
            info!(
                "Cannot proxy message, OpenChat token is not set for Discord channel :: channel.id {}",
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
