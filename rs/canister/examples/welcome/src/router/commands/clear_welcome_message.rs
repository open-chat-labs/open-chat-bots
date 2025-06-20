use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, ChatRole, MessageContentInitial};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

use crate::state;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(ClearWelcomeMessage::definition);

pub struct ClearWelcomeMessage;

#[async_trait]
impl CommandHandler<CanisterRuntime> for ClearWelcomeMessage {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();

        let cleared = state::mutate(|state| state.messages.remove(cxt.scope.chat().unwrap()));

        let message = if cleared {
            "Welcome message cleared"
        } else {
            "No welcome message was set"
        };

        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(message.to_string()),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
    }
}

impl ClearWelcomeMessage {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "clear_welcome_message".to_string(),
            description: Some("This will clear the welcome message".to_string()),
            placeholder: None,
            params: vec![],
            permissions: BotPermissions::empty(),
            default_role: Some(ChatRole::Admin),
            direct_messages: Some(false),
        }
    }
}
