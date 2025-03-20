use crate::{config::OpenChatConfig, state::BotState};
use oc_bots_sdk::api::command::CommandHandlerRegistry;
use oc_bots_sdk::oc_api::client::ClientFactory;
use oc_bots_sdk_offchain::AgentRuntime;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct OcToken {
    pub key: String,
    pub token: String,
}

// Data available across commands invocations
#[derive(Clone)]
pub struct OcData {
    pub oc_client: Arc<ClientFactory<AgentRuntime>>,
    pub oc_config: OpenChatConfig,
    pub commands: Arc<CommandHandlerRegistry<AgentRuntime>>,
    pub state: Arc<BotState>,
}

impl OcData {
    pub fn new(
        oc_client: Arc<ClientFactory<AgentRuntime>>,
        oc_config: OpenChatConfig,
        commands: CommandHandlerRegistry<AgentRuntime>,
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
