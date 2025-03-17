use crate::state;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::{
    BotCommandDefinition, BotCommandParam, BotCommandParamType, IntegerParam,
};
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::{
    BotCommandContext, BotCommandScope, BotPermissions, ChatRole, MessageContentInitial,
};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Delete::definition);

pub struct Delete;

#[async_trait]
impl CommandHandler<CanisterRuntime> for Delete {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        cxt: BotCommandContext,
        _oc_client_factory: &ClientFactory<CanisterRuntime>,
    ) -> Result<SuccessResult, String> {
        let text = match state::mutate(|state| {
            // Extract the chat
            let BotCommandScope::Chat(chat_scope) = &cxt.scope else {
                return Err("This command can only be used in a chat".to_string());
            };

            state
                .reminders
                .delete(&chat_scope.chat, cxt.command.arg("id"))
        }) {
            Ok(reminder) => format!("Reminder deleted: {}", reminder.to_text()),
            Err(error) => error,
        };

        // Reply to the initiator with an ephemeral message
        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(text),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
    }
}

impl Delete {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "remind_delete".to_string(),
            description: Some("Delete a reminder from this chat by ID".to_string()),
            placeholder: None,
            params: vec![BotCommandParam {
                name: "id".to_string(),
                description: Some("The ID of the reminder to delete".to_string()),
                placeholder: Some("Enter a reminder ID...".to_string()),
                required: true,
                param_type: BotCommandParamType::IntegerParam(IntegerParam {
                    choices: vec![],
                    min_value: 1,
                    max_value: 100,
                }),
            }],
            permissions: BotPermissions::default(),
            default_role: Some(ChatRole::Admin),
        }
    }
}
