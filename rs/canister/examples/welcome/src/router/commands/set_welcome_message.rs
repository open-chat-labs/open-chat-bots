use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, ChatRole, MessageContentInitial};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

use crate::state;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(SetWelcomeMessage::definition);

pub struct SetWelcomeMessage;

#[async_trait]
impl CommandHandler<CanisterRuntime> for SetWelcomeMessage {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let text = oc_client.context().command.arg("message");
        let cxt = oc_client.context();

        let existing = state::mutate(|state| state.messages.set(*cxt.scope.chat().unwrap(), text));

        let message = if existing {
            "Welcome message updated"
        } else {
            "Welcome message set"
        };

        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(message.to_string()),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
    }
}

impl SetWelcomeMessage {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "set_welcome_message".to_string(),
            description: Some("This will set the welcome message. If you include {USERNAME} then the user's name will be inserted.".to_string()),
            placeholder: None,
            params: vec![BotCommandParam {
                name: "message".to_string(),
                description: Some("The message to set as welcome".to_string()),
                param_type: BotCommandParamType::StringParam(StringParam {
                    min_length: 1,
                    max_length: 1000,
                    choices: Vec::new(),
                    multi_line: true,
                }),
                required: true,
                placeholder: None,
            }],
            permissions: BotPermissions::empty(),
            default_role: Some(ChatRole::Admin),
            direct_messages: Some(false),
        }
    }
}
