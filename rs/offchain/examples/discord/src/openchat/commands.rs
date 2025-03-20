use crate::shared::OcChannelKey;
use crate::state::BotState;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, MessageContentInitial};
use oc_bots_sdk_offchain::AgentRuntime;
use std::sync::{Arc, LazyLock};
use tracing::info;

// Status command
static STATUS_DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Status::definition);

pub struct Status {
    pub shared_state: Arc<BotState>,
}

#[async_trait]
impl CommandHandler<AgentRuntime> for Status {
    fn definition(&self) -> &BotCommandDefinition {
        &STATUS_DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<AgentRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        info!("OpenChat :: executing status command.");

        let cxt = oc_client.context();
        let key = OcChannelKey::from_bot_context(cxt);
        let num_links: u32 = self
            .shared_state
            .relay_links
            .read()
            .await
            .clone()
            .into_iter()
            .fold(0, |acc, (_, rl)| {
                if rl.oc_channel_key == key {
                    acc + 1
                } else {
                    acc
                }
            });

        // Reply to the initiator with an ephemeral message
        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(if num_links > 0 {
                "This channel has an active relay link to Discord!".into()
            } else {
                "This channel is not linked to any Discord channels!".into()
            }),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
    }
}

impl Status {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "status".to_string(),
            description: Some("Returns status of the bot".to_string()),
            placeholder: None,
            params: vec![],
            permissions: BotPermissions::text_only(),
            default_role: None,
            direct_messages: false,
        }
    }
}
