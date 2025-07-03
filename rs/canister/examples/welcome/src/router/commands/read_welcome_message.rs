use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, ChatRole, MessageContentInitial};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

use crate::state;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(ReadWelcomeMessage::definition);

pub struct ReadWelcomeMessage;

#[async_trait]
impl CommandHandler<CanisterRuntime> for ReadWelcomeMessage {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let chat = cxt.scope.chat().unwrap();

        let text = if let Some(message) = state::read(|state| state.messages.get(chat)) {
            message
        } else {
            "No welcome message is currently set".to_string()
        };

        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(text),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
    }
}

impl ReadWelcomeMessage {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "read_welcome_message".to_string(),
            description: Some("This will show the current welcome message.".to_string()),
            placeholder: None,
            params: vec![],
            permissions: BotPermissions::empty(),
            default_role: Some(ChatRole::Admin),
            direct_messages: Some(false),
        }
    }
}
