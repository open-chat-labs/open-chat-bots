use crate::state;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, MessageContentInitial};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Current::definition);

pub struct Current;

#[async_trait]
impl CommandHandler<CanisterRuntime> for Current {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let chat = cxt.scope.chat().unwrap();

        let message = state::read(|state| {
            state
                .engines
                .get(chat)
                .and_then(|engine| engine.status())
                .map(|(game, turn)| format!("{} (Turn {})", game, turn))
        })
        .unwrap_or("No game in progress. Start a new game with /start".to_string());

        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(message),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
    }
}

impl Current {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "current".to_string(),
            description: Some("This shows the current game if any".to_string()),
            placeholder: None,
            params: vec![],
            permissions: BotPermissions::empty(),
            default_role: None,
            direct_messages: None,
        }
    }
}
