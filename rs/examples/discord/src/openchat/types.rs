use crate::{config::OpenChatConfig, state::BotState};
use oc_bots_sdk::api::command_handler::CommandHandler;
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk_offchain::AgentRuntime;
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use serenity::{ChannelId, Message, Timestamp, UserId};
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

#[derive(Clone, Debug)]
pub struct RelayMessage {
    pub oc_message: OcMessage,
    pub oc_api_token: OcToken,
}

impl RelayMessage {
    pub fn from_message(message: Message, oc_api_token: OcToken) -> Self {
        Self {
            oc_message: message.into(),
            oc_api_token,
        }
    }
}

// Message to be relayed to the OpenChat API
#[derive(Clone, Debug)]
pub struct OcMessage {
    pub ds_channel_id: ChannelId,
    pub ds_user_id: UserId,
    pub ds_user_name: String,
    pub content: String,
    pub timestamp: Timestamp,
}

impl From<Message> for OcMessage {
    fn from(message: Message) -> Self {
        Self {
            ds_channel_id: message.channel_id,
            ds_user_id: message.author.id,
            ds_user_name: message.author.name,
            content: message.content,
            timestamp: message.timestamp,
        }
    }
}
