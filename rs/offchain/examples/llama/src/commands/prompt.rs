use crate::llm_canister_agent::LlmCanisterAgent;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk_offchain::AgentRuntime;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Prompt::definition);

pub struct Prompt {
    llm_canister_agent: LlmCanisterAgent,
}

#[async_trait]
impl CommandHandler<AgentRuntime> for Prompt {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<AgentRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let message = oc_client.context().command.arg("message");

        let llm_response = self.llm_canister_agent.prompt(message).await?;

        // Send the message to OpenChat but don't wait for the response
        let message = oc_client
            .send_text_message(llm_response)
            .execute_then_return_message(|_, _| ());

        Ok(SuccessResult { message })
    }
}

impl Prompt {
    pub fn new(llm_canister_agent: LlmCanisterAgent) -> Self {
        Prompt { llm_canister_agent }
    }

    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "prompt".to_string(),
            description: Some("Send a prompt to the Llama3.1 LLM".to_string()),
            placeholder: Some("Waiting...".to_string()),
            params: vec![BotCommandParam {
                name: "message".to_string(),
                description: Some("The message to send to the LLM".to_string()),
                placeholder: Some("Message".to_string()),
                required: true,
                param_type: BotCommandParamType::StringParam(StringParam {
                    min_length: 1,
                    max_length: 10000,
                    choices: Vec::new(),
                    multi_line: true,
                }),
            }],
            permissions: BotPermissions::from_message_permission(MessagePermission::Text),
            default_role: None,
            direct_messages: true,
        }
    }
}
