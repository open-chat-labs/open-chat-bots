use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::actions::chat_summary::Response;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, MessageContentInitial};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(ChatSummary::definition);

pub struct ChatSummary;

#[async_trait]
impl CommandHandler<CanisterRuntime> for ChatSummary {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();

        let message_id = cxt.scope.message_id();

        match oc_client.chat_summary().execute_async().await {
            Ok(Response::Success(result)) => {
                let text = format!(
                    "```\n{}\n```",
                    serde_json::to_string_pretty(&result).unwrap_or_default()
                );

                // Reply to the initiator with an ephemeral message
                Ok(EphemeralMessageBuilder::new(
                    MessageContentInitial::from_text(text),
                    message_id.unwrap(),
                )
                .build()
                .into())
            }
            Ok(Response::Error(error)) => Err(format!("Error calling bot_chat_summary: {error:?}")),
            Err(error) => Err(format!("C2C error calling bot_chat_summary: {error:?}")),
        }
    }
}

impl ChatSummary {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "chat_summary".to_string(),
            description: Some("This will give a summary of the current chat".to_string()),
            placeholder: Some("Please wait".to_string()),
            params: vec![],
            permissions: BotPermissions::from_chat_permission(ChatPermission::ReadSummary),
            default_role: None,
            direct_messages: None,
        }
    }
}
