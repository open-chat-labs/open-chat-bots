use crate::model::reminders::{self, RemindWhen, Reminder};
use crate::state;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::{
    BotCommandDefinition, BotCommandParam, BotCommandParamType, StringParam,
};
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{
    BotCommandContext, BotCommandScope, BotPermissions, ChatRole, MessageContentInitial,
};
use oc_bots_sdk_canister::{env, CanisterRuntime};
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(RemindRecurring::definition);

pub struct RemindRecurring;

#[async_trait]
impl CommandHandler<CanisterRuntime> for RemindRecurring {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let what = cxt.command.arg("what");
        let when = cxt.command.arg("when");
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
                RemindWhen::Recurring(when),
                timezone,
                cxt.command.initiator,
                chat_scope.chat,
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
            format!(
                "Reminder #{} next occurs {}",
                result.chat_reminder_id,
                Reminder::format_datetime(result.timestamp, &result.timezone),
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

impl RemindRecurring {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "remind_recurring".to_string(),
            description: Some("/remind_recurring \"Daily stand-up starting now\" \"9am every weekday\"".to_string()),
            placeholder: None,
            params: vec![
                BotCommandParam {
                    name: "what".to_string(),
                    description: Some(
                        "The reminder message to be sent. This supports `markdown` to style messages.".to_string(),
                    ),
                    placeholder: Some("Enter a reminder message...".to_string()),
                    required: true,
                    param_type: BotCommandParamType::StringParam(StringParam {
                        choices: vec![],
                        min_length: 1,
                        max_length: 5000,
                        multi_line: true,
                    }),
                },
                BotCommandParam {
                    name: "when".to_string(),
                    description: Some(
                        "The recurring schedule to send the reminder (using natural language)".to_string(),
                    ),
                    placeholder: Some("Say when you want the reminder...".to_string()),
                    required: true,
                    param_type: BotCommandParamType::StringParam(StringParam {
                        choices: vec![],
                        min_length: 1,
                        max_length: 200,
                        multi_line: false,
                    }),
                },
            ],
            permissions: BotPermissions::default(),
            default_role: Some(ChatRole::Admin),
            direct_messages: false,
        }
    }
}
