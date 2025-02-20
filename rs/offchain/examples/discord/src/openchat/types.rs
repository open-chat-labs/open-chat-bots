use crate::{config::OpenChatConfig, state::BotState};
use oc_bots_sdk::api::command_handler::CommandHandler;
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk_offchain::AgentRuntime;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct OcToken(pub String);

// Data available across commands invocations
#[derive(Clone)]
pub struct OcData {
    pub oc_client: Arc<ClientFactory<AgentRuntime>>,
    pub oc_config: OpenChatConfig,
    pub commands: Arc<CommandHandler<AgentRuntime>>,
    pub state: Arc<BotState>,
}

impl OcData {
    pub fn new(
        oc_client: Arc<ClientFactory<AgentRuntime>>,
        oc_config: OpenChatConfig,
        commands: CommandHandler<AgentRuntime>,
        state: Arc<BotState>,
    ) -> Self {
        Self {
            oc_client,
            oc_config,
            commands: Arc::new(commands),
            state,
        }
    }
}
