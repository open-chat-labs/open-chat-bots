use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk_offchain::AgentRuntime;
use rand::random;
use std::{collections::HashSet, sync::LazyLock};

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Coin::definition);

pub struct Coin;

#[async_trait]
impl CommandHandler<AgentRuntime> for Coin {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        cxt: BotCommandContext,
        oc_client_factory: &ClientFactory<AgentRuntime>,
    ) -> Result<SuccessResult, String> {
        let count = cxt.command.maybe_arg("count").unwrap_or(1);

        let mut text = String::new();

        for i in 0..count {
            if i > 0 {
                text.push('\n');
            }
            let heads = random::<bool>();
            text.push_str(if heads { "heads" } else { "tails" });
        }

        // Send the message to OpenChat but don't wait for the response
        let message = oc_client_factory
            .build_command_client(cxt)
            .send_text_message(text)
            .execute_then_return_message(|_, _| ());

        Ok(SuccessResult {
            message: Some(message),
        })
    }
}

impl Coin {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "coin".to_string(),
            description: Some("Let's toss some coins!".to_string()),
            placeholder: Some("Tossing...".to_string()),
            params: vec![BotCommandParam {
                name: "count".to_string(),
                description: Some("The number of coins to toss".to_string()),
                placeholder: Some("1".to_string()),
                required: false,
                param_type: BotCommandParamType::IntegerParam(IntegerParam {
                    min_value: 1,
                    max_value: 10,
                    choices: Vec::new(),
                }),
            }],
            permissions: BotPermissions {
                message: HashSet::from_iter([MessagePermission::Text]),
                ..Default::default()
            },
            default_role: None,
        }
    }
}
