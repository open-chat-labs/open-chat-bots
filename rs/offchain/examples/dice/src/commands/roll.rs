use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk_offchain::AgentRuntime;
use rand::{thread_rng, Rng};
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Roll::definition);

pub struct Roll;

#[async_trait]
impl CommandHandler<AgentRuntime> for Roll {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<AgentRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let sides = cxt.command.maybe_arg("sides").unwrap_or(6);
        let count = cxt.command.maybe_arg("count").unwrap_or(1);

        let mut text = String::new();
        for i in 0..count {
            if i > 0 {
                text.push('\n');
            }
            let roll = thread_rng().gen_range(1..=sides);
            text.push_str(&roll.to_string());
        }

        // Send the message to OpenChat but don't wait for the response
        let message = oc_client
            .send_text_message(text)
            .execute_then_return_message(|_, _| ());

        Ok(SuccessResult { message })
    }
}

impl Roll {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "roll".to_string(),
            description: Some("Let's roll some dice!".to_string()),
            placeholder: Some("Rolling...".to_string()),
            params: vec![
                BotCommandParam {
                    name: "sides".to_string(),
                    description: Some("The number of sides on each die".to_string()),
                    placeholder: Some("6".to_string()),
                    required: false,
                    param_type: BotCommandParamType::IntegerParam(IntegerParam {
                        min_value: 1,
                        max_value: 1_000_000_000,
                        choices: Vec::new(),
                    }),
                },
                BotCommandParam {
                    name: "count".to_string(),
                    description: Some("The number of dice to roll".to_string()),
                    placeholder: Some("1".to_string()),
                    required: false,
                    param_type: BotCommandParamType::IntegerParam(IntegerParam {
                        min_value: 1,
                        max_value: 10,
                        choices: Vec::new(),
                    }),
                },
            ],
            permissions: BotPermissions::text_only(),
            default_role: None,
            direct_messages: false,
        }
    }
}
