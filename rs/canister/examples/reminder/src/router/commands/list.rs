use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::BotCommandDefinition;
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::{BotCommandContext, BotCommandScope, BotPermissions, ChatRole};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

use crate::state;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(List::definition);

pub struct List;

#[async_trait]
impl CommandHandler<CanisterRuntime> for List {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        cxt: BotCommandContext,
        oc_client_factory: &ClientFactory<CanisterRuntime>,
    ) -> Result<SuccessResult, String> {
        let list = state::mutate(|state| {
            // Extract the chat
            let BotCommandScope::Chat(chat_scope) = &cxt.scope else {
                return Err("This command can only be used in a chat".to_string());
            };

            Ok(state.reminders.list(&chat_scope.chat))
        })?;

        let mut text = String::new();
        for reminder in list {
            text.push_str(&format!("{}\n", reminder.to_text()));
        }

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

        Ok(SuccessResult {
            message: Some(message),
        })
    }
}

impl List {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "list".to_string(),
            description: Some("List the reminders set in this chat with their IDs".to_string()),
            placeholder: None,
            params: vec![],
            permissions: BotPermissions::text_only(),
            default_role: Some(ChatRole::Admin),
        }
    }
}
