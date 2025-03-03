use async_trait::async_trait;
use chrono::DateTime;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::{
    BotCommandDefinition, BotCommandParam, BotCommandParamType, StringParam,
};
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::{
    BotCommandContext, BotCommandScope, BotPermissions, ChatRole, MessageContentInitial,
};
use oc_bots_sdk_canister::{env, CanisterRuntime};
use std::sync::LazyLock;

use crate::{reminders, state};

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
        let timezone = cxt.command.timezone();

        let text = state::mutate(|state| {
            // Extract the chat
            let BotCommandScope::Chat(chat_scope) = &cxt.scope else {
                return "This command can only be used in a chat".to_string();
            };

            // Check if there is an API Key registered at the required scope and with the required permissions
            if state
                .api_key_registry
                .get_key_with_required_permissions(
                    &cxt.scope.clone().into(),
                    &BotPermissions::text_only(),
                )
                .is_none()
            {
                return "You must first register an API key for this chat with the \"send text message\" permission".to_string();
            }

            // Add the reminder to the state
            let result = match state.reminders.add(
                what,
                when,
                repeat,
                timezone,
                cxt.command.initiator,
                chat_scope.chat.clone(),
                env::now(),
            ) {
                Ok(result) => result,
                Err(e) => return e,
            };

            if result.next_due {
                reminders::restart_job(state);
            } else {
                reminders::start_job_if_required(state);
            }

            // Return the reminder text
            let next = DateTime::from_timestamp_millis(result.timestamp as i64)
                .unwrap()
                .with_timezone(&result.timezone);

            format!(
                "Reminder #{} on {}{}",
                result.chat_reminder_id,
                next.to_rfc2822(),
                if repeat { " [repeats]" } else { "" }
            )
        });

        // Reply to the initiator with an ephemeral message
        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(text),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
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
                        mutli_line: true,
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
                        mutli_line: false,
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
            permissions: BotPermissions::default(),
            default_role: Some(ChatRole::Admin),
        }
    }
}
