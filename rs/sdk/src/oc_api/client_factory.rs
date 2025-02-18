use crate::runtime::Runtime;
use crate::types::{BotApiKeyContext, BotCommandContext};
use api_key::ClientForApiKey;
use command::ClientForCommand;
use std::sync::Arc;

mod api_key;
mod command;

pub struct ClientFactory<R> {
    runtime: Arc<R>,
}

impl<R: Runtime> ClientFactory<R> {
    pub fn new(runtime: R) -> Self {
        Self {
            runtime: Arc::new(runtime),
        }
    }

    pub fn build_command_client(&self, context: BotCommandContext) -> ClientForCommand<R> {
        ClientForCommand::new(self.runtime.clone(), context)
    }

    pub fn build_api_key_client(&self, context: BotApiKeyContext) -> ClientForApiKey<R> {
        ClientForApiKey::new(self.runtime.clone(), context)
    }
}
