use crate::types::{
    ActionResponse, BotAction, BotApiKeyContext, BotMessageAction, CallResult, MessageContent,
    TextContent,
};
use crate::Runtime;
use std::sync::Arc;

pub struct OpenChatClientForApiKey<R: Runtime> {
    runtime: Arc<R>,
    context: BotApiKeyContext,
}

impl<R: Runtime + Send + Sync + 'static> OpenChatClientForApiKey<R> {
    pub fn new(runtime: Arc<R>, context: BotApiKeyContext) -> Self {
        OpenChatClientForApiKey { runtime, context }
    }

    pub async fn send_text_message(
        &self,
        text: String,
        finalised: bool,
    ) -> CallResult<(ActionResponse,)> {
        let content = MessageContent::Text(TextContent { text });
        let action = BotAction::SendMessage(BotMessageAction {
            content: content.clone(),
            finalised,
        });

        self.execute_bot_action(action).await
    }

    pub async fn execute_bot_action(&self, action: BotAction) -> CallResult<(ActionResponse,)> {
        let bot_api_gateway = self.context.bot_api_gateway();
        let jwt = self.context.jwt().to_string();

        self.runtime
            .execute_bot_action(bot_api_gateway, jwt, action.clone())
            .await
    }
}
