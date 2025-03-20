use crate::state;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::send_message;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Joke::definition);

pub struct Joke;

#[async_trait]
impl CommandHandler<CanisterRuntime> for Joke {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let text = state::read(|state| state.get_random_joke());

        // Send the message to OpenChat but don't wait for the response
        let message = oc_client
            .send_text_message(text)
            .execute_then_return_message(|args, response| match response {
                Ok(send_message::Response::Success(_)) => {
                    state::mutate(|state| state.increment_jokes_sent());
                }
                error => {
                    ic_cdk::println!("send_text_message: {args:?}, {error:?}");
                }
            });

        Ok(SuccessResult { message })
    }
}

impl Joke {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "joke".to_string(),
            description: Some("This will send a random joke".to_string()),
            placeholder: Some("Thinking of a joke...".to_string()),
            params: vec![],
            permissions: BotPermissions::text_only(),
            default_role: None,
            direct_messages: false,
        }
    }
}
