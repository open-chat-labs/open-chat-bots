use crate::{rng, state};
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{
    BotCommandContext, BotCommandScope, ChatRole, InstallationLocation, MessageContentInitial,
};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(GenerateApiKey::definition);

pub struct GenerateApiKey;

#[async_trait]
impl CommandHandler<CanisterRuntime> for GenerateApiKey {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();

        let text = state::mutate(|state| {
            // Extract the chat
            let BotCommandScope::Chat(chat_scope) = &cxt.scope else {
                return "This command can only be used in a chat".to_string();
            };

            // Generate an API key
            let location = chat_scope.chat.into();
            let api_key = rng::mutate(|rng| {
                state
                    .api_key_registry
                    .generate(cxt.api_gateway, location, rng)
            });

            let webhooks = match location {
                InstallationLocation::Community(_) => {
                    "`created_channel`, `deleted_channel`, and `send_message` webhooks"
                }
                _ => "`send_message` webhook",
            };

            let scope = match location {
                InstallationLocation::Community(_) => "community",
                _ => "chat",
            };

            // Return the API key
            format!(
                "This API key allows an external system to call this bot's {} acting within this {}:\n\n```{}```\n\nMake sure to store this key somewhere secure and don't share it.",
                webhooks, scope, api_key
            )
        });

        // Reply to the initiator with an ephemeral message
        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(text),
            cxt.scope.message_id().unwrap(),
        )
        .with_block_level_markdown(true)
        .build()
        .into())
    }
}

impl GenerateApiKey {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "generate_api_key".to_string(),
            description: Some("This will generate an api key which can be used by a 3rd party to call one of the webhooks".to_string()),
            placeholder: Some("Please wait".to_string()),
            params: vec![],
            permissions: BotPermissions::default(),
            default_role: Some(ChatRole::Owner),
            direct_messages: None,
        }
    }
}
