use crate::state;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::send_message;
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk_canister::CanisterRuntime;
use std::collections::HashSet;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Greet::definition);

pub struct Greet;

#[async_trait]
impl CommandHandler<CanisterRuntime> for Greet {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        cxt: BotCommandContext,
        oc_client_factory: &ClientFactory<CanisterRuntime>,
    ) -> Result<SuccessResult, String> {
        let user_id = cxt.command.initiator;
        let text = format!("hello @UserId({user_id})");

        // Send the message to OpenChat but don't wait for the response
        let message = oc_client_factory
            .build_command_client(cxt)
            .send_text_message(text)
            .execute_then_return_message(|args, response| match response {
                Ok(send_message::Response::Success(_)) => {
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

impl Greet {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "greet".to_string(),
            description: Some("This will greet the caller".to_string()),
            placeholder: Some("Please wait".to_string()),
            params: vec![],
            permissions: BotPermissions {
                message: HashSet::from_iter([MessagePermission::Text]),
                ..Default::default()
            },
            default_role: None,
        }
    }
}
