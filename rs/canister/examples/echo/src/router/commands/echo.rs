use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::send_message;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Echo::definition);

pub struct Echo;

#[async_trait]
impl CommandHandler<CanisterRuntime> for Echo {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let text = oc_client.context().command.arg("message");

        // Send the message to OpenChat but don't wait for the response
        let message = oc_client
            .send_text_message(text)
            .with_block_level_markdown(true)
            .execute_then_return_message(|args, response| match response {
                Ok(send_message::Response::Success(_)) => {}
                error => {
                    ic_cdk::println!("send_text_message: {args:?}, {error:?}");
                }
            });

        Ok(SuccessResult { message })
    }
}

impl Echo {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "echo".to_string(),
            description: Some("This will echo any text".to_string()),
            placeholder: None,
            params: vec![BotCommandParam {
                name: "message".to_string(),
                description: Some("The message to echo".to_string()),
                param_type: BotCommandParamType::StringParam(StringParam {
                    min_length: 1,
                    max_length: 1000,
                    choices: Vec::new(),
                    multi_line: true,
                }),
                required: true,
                placeholder: None,
            }],
            permissions: BotPermissions::text_only(),
            default_role: None,
            direct_messages: true,
        }
    }
}
