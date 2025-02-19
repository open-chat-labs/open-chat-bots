use crate::config::OpenChatConfig;
use crate::errors::BotError;
use crate::openchat::types::RelayMessage;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::{AuthToken, BotApiKeyContext, MessageContent, TextContent};
use oc_bots_sdk_offchain::env;
use oc_bots_sdk_offchain::AgentRuntime;
use std::sync::Arc;
use tokio::sync::mpsc::Receiver;
use tracing::{error, info};

pub async fn handle_openchat_events(
    oc_client: Arc<ClientFactory<AgentRuntime>>,
    oc_config: OpenChatConfig,
    mut rx: Receiver<RelayMessage>,
) -> Result<(), BotError> {
    info!("Awaiting for Discord messages");

    while let Some(message) = rx.recv().await {
        let auth_token = AuthToken::ApiKey(message.oc_api_token.0);
        let context = BotApiKeyContext::parse(auth_token, &oc_config.public_key, env::now());

        match context {
            Ok(ctx) => {
                info!(
                    "Relay Discord message :: [{}] > {}",
                    message.oc_message.ds_user_name, message.oc_message.content
                );

                let msg = message.oc_message;
                let res = oc_client
                    .build_api_key_client(ctx)
                    .send_message(MessageContent::Text(TextContent {
                        text: format!("**[ {} ]** {}", msg.ds_user_name, msg.content),
                    }))
                    .execute_async()
                    .await;

                if let Err(err) = res {
                    error!("Could not relay message :: {:?}", err);
                }
            }
            Err(err) => error!("Relay message error :: {:?}", err),
        };
    }

    Ok(())
}
