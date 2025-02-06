use crate::runtime::Runtime;
use crate::types::{BotApiKeyContext, BotCommandContext};
use api_key::OpenChatClientForApiKey;
use command::OpenChatClientForCommand;
use std::sync::Arc;

mod api_key;
mod command;

pub struct OpenChatClient<R> {
    runtime: Arc<R>,
}

impl<R: Runtime + Send + Sync + 'static> OpenChatClient<R> {
    pub fn new(runtime: R) -> Self {
        Self {
            runtime: Arc::new(runtime),
        }
    }

    pub fn with_command_context(&self, context: BotCommandContext) -> OpenChatClientForCommand<R> {
        OpenChatClientForCommand::new(self.runtime.clone(), context)
    }

    pub fn with_api_key_context(&self, context: BotApiKeyContext) -> OpenChatClientForApiKey<R> {
        OpenChatClientForApiKey::new(self.runtime.clone(), context)
    }
}
