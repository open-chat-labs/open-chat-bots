use async_trait::async_trait;
use chrono::DateTime;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::{
    BotCommandDefinition, BotCommandParam, BotCommandParamType, StringParam,
};
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::{
    BotCommandContext, BotCommandScope, BotPermissions, ChatRole
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
        oc_client_factory: &ClientFactory<CanisterRuntime>,
    ) -> Result<SuccessResult, String> {

        // TODO: Take the initiator's local browser timezone somehow. Hmm - we don't them to have to explicitly pass it in as an arg
        // TODO: Perhaps the command definition needs to include implicit params that the OC website can provide such as the user's timezone and locale
        // TODO: Wire up scheduling

        let result = state::mutate(|state| {
            // Extract the chat
            let BotCommandScope::Chat(chat_scope) = &cxt.scope else {
                return Err("This command can only be used in a chat".to_string());
            };

            // Check if there an API Key registered at the required scope and with the required permissions
            let _api_key = 
                state
                    .api_key_registry
                    .get_key_with_required_permissions(&cxt.scope.clone().into(), &BotPermissions::text_only())
                    .cloned()
                    .ok_or("You must first register an API key for this chat with the \"send text message\" permission".to_string())?;

            // Add the reminder to the state
            // TODO: Pass in the initiator's local timezone
            let result = state.reminders.add(
                cxt.command.arg("what"),
                cxt.command.arg("when"),
                cxt.command.initiator,
                chat_scope.chat.clone(),
                env::now(),
            );

            result
        })?;

        // Compose a reply to the initiator
        // TODO: Format using the initiator's local timezone
        let next = DateTime::from_timestamp_millis(result.next_schedule as i64).unwrap();
        let first = if result.repeats { " first" } else { "" };
        let text = format!("Your{} reminder with ID {} will be sent on {}", first, result.chat_reminder_id, next.to_rfc2822());

        // Send the message to OpenChat but don't wait for the response
        let message = oc_client_factory
            .build_command_client(cxt)
            .send_text_message(text)
            .for_initiator_only()
            .execute_then_return_message(|args, response| match response {
                Ok(_) => (),
                error => {
                    ic_cdk::println!("send_text_message: {args:?}, {error:?}");
                }
            });


        Ok(SuccessResult { message: Some(message) })
    }
}

impl Remind {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "remind".to_string(),
            description: Some("/remind \"drink water\" \"every day at 4:00 pm\"".to_string()),
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
            ],
            permissions: BotPermissions::text_only(),
            default_role: Some(ChatRole::Admin),
        }
    }
}
