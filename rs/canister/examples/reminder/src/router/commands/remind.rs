use async_trait::async_trait;
use chrono::DateTime;
use oc_bots_sdk::api::command::{CommandHandler, Message, SuccessResult};
use oc_bots_sdk::api::definition::{
    BotCommandDefinition, BotCommandParam, BotCommandParamType, StringParam,
};
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::{
    BotCommandContext, BotCommandScope, BotPermissions, ChatRole, MessageContent, TextContent,
};
use oc_bots_sdk_canister::{env, CanisterRuntime};
use std::sync::LazyLock;

use crate::state;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Remind::definition);

pub struct Remind;

#[async_trait]
impl CommandHandler<CanisterRuntime> for Remind {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        cxt: BotCommandContext,
        _oc_client_factory: &ClientFactory<CanisterRuntime>,
    ) -> Result<SuccessResult, String> {
        let what = cxt.command.arg("what");
        let when = cxt.command.arg("when");
        let repeat = cxt.command.maybe_arg("repeat").unwrap_or_default();

        let local_timezone = cxt
            .command
            .meta
            .as_ref()
            .map(|meta| meta.timezone.clone())
            .unwrap_or("UTC".to_string());

        // TODO: Wire up scheduling

        let result = state::mutate(|state| {
            // Extract the chat
            let BotCommandScope::Chat(chat_scope) = &cxt.scope else {
                return Err("This command can only be used in a chat".to_string());
            };

            // Check if there an API Key registered at the required scope and with the required permissions
            state
                .api_key_registry
                .get_key_with_required_permissions(&cxt.scope.clone().into(), &BotPermissions::text_only())
                .ok_or("You must first register an API key for this chat with the \"send text message\" permission".to_string())?;

            // Add the reminder to the state
            // TODO: Pass in the initiator's local timezone

            state.reminders.add(
                what,
                when,
                repeat,
                &local_timezone,
                cxt.command.initiator,
                chat_scope.chat.clone(),
                env::now(),
            )
        })?;

        // Compose a reply to the initiator
        let next = DateTime::from_timestamp_millis(result.timestamp as i64).unwrap();
        let text = format!(
            "Reminder #{} on {}{}",
            result.chat_reminder_id,
            next.to_rfc2822(),
            if repeat { " [repeats]" } else { "" }
        );

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

impl Remind {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "remind".to_string(),
            description: Some("/remind \"drink water\" \"at 4:00 pm\" true".to_string()),
            placeholder: None,
            params: vec![
                BotCommandParam {
                    name: "what".to_string(),
                    description: Some(
                        "The reminder message to be sent at the specified time(s)".to_string(),
                    ),
                    placeholder: Some("Enter a reminder message...".to_string()),
                    required: true,
                    param_type: BotCommandParamType::StringParam(StringParam {
                        choices: vec![],
                        min_length: 1,
                        max_length: 5000,
                    }),
                },
                BotCommandParam {
                    name: "when".to_string(),
                    description: Some(
                        "When to send a reminder (using natural language)".to_string(),
                    ),
                    placeholder: Some("Say when you want the reminder...".to_string()),
                    required: true,
                    param_type: BotCommandParamType::StringParam(StringParam {
                        choices: vec![],
                        min_length: 1,
                        max_length: 200,
                    }),
                },
                BotCommandParam {
                    name: "repeat".to_string(),
                    description: Some("Whether this reminder repeats".to_string()),
                    placeholder: None,
                    required: false,
                    param_type: BotCommandParamType::BooleanParam,
                },
            ],
            permissions: BotPermissions::text_only(),
            default_role: Some(ChatRole::Admin),
        }
    }
}
