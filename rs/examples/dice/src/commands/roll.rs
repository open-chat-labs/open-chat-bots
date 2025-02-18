use async_trait::async_trait;
use oc_bots_sdk::api::{
    BotPermissions, IntegerParam, MessagePermission, SlashCommandDefinition, SlashCommandParam,
    SlashCommandParamType, SuccessResult,
};
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk::{Command, OpenChatClientFactory};
use oc_bots_sdk_offchain::AgentRuntime;
use rand::{thread_rng, Rng};
use std::{collections::HashSet, sync::LazyLock};

static DEFINITION: LazyLock<SlashCommandDefinition> = LazyLock::new(Roll::definition);

pub struct Roll;

#[async_trait]
impl Command<AgentRuntime> for Roll {
    fn definition(&self) -> &SlashCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        cxt: BotCommandContext,
        oc_client_factory: &OpenChatClientFactory<AgentRuntime>,
    ) -> Result<SuccessResult, String> {
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
        let message = oc_client_factory
            .build_command_client(cxt)
            .send_text_message(text)
            .execute_then_return_message(|_, _| ());

        Ok(SuccessResult {
            message: Some(message),
        })
    }
}

impl Roll {
    fn definition() -> SlashCommandDefinition {
        SlashCommandDefinition {
            name: "roll".to_string(),
            description: Some("Let's roll some dice!".to_string()),
            placeholder: Some("Rolling...".to_string()),
            params: vec![
                SlashCommandParam {
                    name: "sides".to_string(),
                    description: Some("The number of sides on each die".to_string()),
                    placeholder: Some("6".to_string()),
                    required: false,
                    param_type: SlashCommandParamType::IntegerParam(IntegerParam {
                        min_value: 1,
                        max_value: 1_000_000_000,
                        choices: Vec::new(),
                    }),
                },
                SlashCommandParam {
                    name: "count".to_string(),
                    description: Some("The number of dice to roll".to_string()),
                    placeholder: Some("1".to_string()),
                    required: false,
                    param_type: SlashCommandParamType::IntegerParam(IntegerParam {
                        min_value: 1,
                        max_value: 10,
                        choices: Vec::new(),
                    }),
                },
            ],
            permissions: BotPermissions {
                message: HashSet::from_iter([MessagePermission::Text]),
                ..Default::default()
            },
        }
    }
}
