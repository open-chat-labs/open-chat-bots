use crate::runtime::Runtime;
use crate::types::{BotApiKeyContext, BotCommandContext};
use api_key::OpenChatClientForApiKey;
use command::OpenChatClientForCommand;
use std::sync::Arc;

mod api_key;
mod command;

pub struct OpenChatClientFactory<R> {
    runtime: Arc<R>,
}

impl<R: Runtime> OpenChatClientFactory<R> {
    pub fn new(runtime: R) -> Self {
        Self {
            runtime: Arc::new(runtime),
        }
    }

    pub fn build_command_client(&self, context: BotCommandContext) -> OpenChatClientForCommand<R> {
        OpenChatClientForCommand::new(self.runtime.clone(), context)
    }

    pub fn build_api_key_client(&self, context: BotApiKeyContext) -> OpenChatClientForApiKey<R> {
        OpenChatClientForApiKey::new(self.runtime.clone(), context)
    }
}
