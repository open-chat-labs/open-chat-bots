use crate::state;
use async_trait::async_trait;
use oc_bots_sdk::api::{
    BotPermissions, MessagePermission, SendMessageResponse, SlashCommandDefinition, SuccessResult,
};
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk::{Command, OpenChatClient};
use oc_bots_sdk_canister::CanisterRuntime;
use std::collections::HashSet;
use std::sync::LazyLock;

static DEFINITION: LazyLock<SlashCommandDefinition> = LazyLock::new(Joke::definition);

pub struct Joke;

#[async_trait]
impl Command<CanisterRuntime> for Joke {
    fn definition(&self) -> &SlashCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        context: BotCommandContext,
        oc_client: &OpenChatClient<CanisterRuntime>,
    ) -> Result<SuccessResult, String> {
        let text = state::read(|state| state.get_random_joke());

        // Send the message to OpenChat but don't wait for the response
        let message = oc_client
            .with_command_context(context)
            .send_text_message(text)
            .execute(|args, response| match response {
                Ok(result) if matches!(result.0, SendMessageResponse::Success(_)) => {
                    state::mutate(|state| state.increment_jokes_sent());
                }
                error => {
                    ic_cdk::println!("send_text_message: {args:?}, {error:?}");
                }
            });

        Ok(SuccessResult {
            message: Some(message),
        })
    }
}

impl Joke {
    fn definition() -> SlashCommandDefinition {
        SlashCommandDefinition {
            name: "joke".to_string(),
            description: Some("This will send a random joke".to_string()),
            placeholder: Some("Thinking of a joke...".to_string()),
            params: vec![],
            permissions: BotPermissions {
                community: HashSet::new(),
                chat: HashSet::new(),
                message: HashSet::from_iter([MessagePermission::Text]),
            },
        }
    }
}
