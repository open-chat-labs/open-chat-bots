use crate::state;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, Message, SuccessResult};
use oc_bots_sdk::api::definition::{
    BotCommandDefinition, BotCommandParam, BotCommandParamType, IntegerParam,
};
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::{
    BotCommandContext, BotCommandScope, BotPermissions, ChatRole, MessageContent, TextContent,
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
        let reminder = state::mutate(|state| {
            // Extract the chat
            let BotCommandScope::Chat(chat_scope) = &cxt.scope else {
                return Err("This command can only be used in a chat".to_string());
            };

            state
                .reminders
                .delete(&chat_scope.chat, cxt.command.arg("id"))
        })?;

        let text = format!("Reminder deleted: {}", reminder.to_text());

        // Reply to the initiator with an ephemeral message
        Ok(SuccessResult {
            message: Some(Message {
                id: cxt.scope.message_id().unwrap(),
                content: MessageContent::Text(TextContent { text }),
                block_level_markdown: false,
                finalised: true,
                ephemeral: true,
            }),
        })
    }
}

impl Delete {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "delete".to_string(),
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
            permissions: BotPermissions::text_only(),
            default_role: Some(ChatRole::Admin),
        }
    }
}
