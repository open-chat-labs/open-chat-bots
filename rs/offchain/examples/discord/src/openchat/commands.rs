use async_trait::async_trait;
use oc_bots_sdk::api::command_handler::Command;
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::{
    api::{BotCommandDefinition, BotPermissions, MessagePermission, SuccessResult},
    types::BotCommandContext,
};
use oc_bots_sdk_offchain::AgentRuntime;
use std::{collections::HashSet, sync::LazyLock};

// Status command
static STATUS_DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Status::definition);

pub struct Status;

#[async_trait]
impl Command<AgentRuntime> for Status {
    fn definition(&self) -> &BotCommandDefinition {
        &STATUS_DEFINITION
    }

    async fn execute(
        &self,
        ctx: BotCommandContext,
        oc_client_factory: &ClientFactory<AgentRuntime>,
    ) -> Result<SuccessResult, String> {
        // TODO return status for the bot, i.e. if its current channel is
        //      receiving messages from a discord channel, or what that channel
        //      on the Discord side may be.

        let message = oc_client_factory
            .build_command_client(ctx)
            .send_text_message("[TODO]".to_string())
            .execute_then_return_message(|_, _| ());

        Ok(SuccessResult {
            message: Some(message),
        })
    }
}

impl Status {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "status".to_string(),
            description: Some("Returns status of the bot".to_string()),
            placeholder: None,
            params: vec![],
            permissions: BotPermissions {
                message: HashSet::from_iter([MessagePermission::Text]),
                ..Default::default()
            },
            default_role: None,
        }
    }
}
