use crate::model::reminders::{self, RemindWhen, Reminder};
use crate::state;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::{
    BotCommandDefinition, BotCommandParam, BotCommandParamType, DateTimeParam, StringParam,
};
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{
    BotCommandContext, BotCommandScope, BotPermissions, ChatRole, MessageContentInitial,
};
use oc_bots_sdk_canister::{env, CanisterRuntime};
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(RemindAt::definition);

pub struct RemindAt;

#[async_trait]
impl CommandHandler<CanisterRuntime> for RemindAt {
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
                RemindWhen::Once(when),
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

            format!(
                "Reminder #{} {}",
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

impl RemindAt {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "remind_at".to_string(),
            description: Some("/remind_at \"Go to dentist appointment\" \"4pm tomorrow\"".to_string()),
            placeholder: None,
            params: vec![
                BotCommandParam {
                    name: "what".to_string(),
                    description: Some(
                        "The reminder message to be sent at the specified time. This supports `markdown` to style messages.".to_string(),
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
                        "The date and time to send the reminder".to_string(),
                    ),
                    placeholder: Some("Pick a date/time to send the reminder...".to_string()),
                    required: true,
                    param_type: BotCommandParamType::DateTimeParam(DateTimeParam {
                        future_only: true,
                    }),
                },
            ],
            permissions: BotPermissions::default(),
            default_role: Some(ChatRole::Admin),
            direct_messages: false,
        }
    }
}
