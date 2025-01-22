use crate::api::Message;
use crate::runtime::Runtime;
use crate::types::{
    ActionResponse, BotAction, BotCommandContext, BotMessageAction, CallResult, MessageContent,
    TextContent,
};
use std::sync::Arc;

pub struct OpenChatClient<R> {
    runtime: Arc<R>,
}

impl<R: Runtime + Send + Sync + 'static> OpenChatClient<R> {
    pub fn new(runtime: R) -> Self {
        Self {
            runtime: Arc::new(runtime),
        }
    }

    pub fn send_text_message<
        F: FnOnce(BotAction, CallResult<(ActionResponse,)>) + Send + Sync + 'static,
    >(
        &self,
        context: &BotCommandContext,
        text: String,
        finalised: bool,
        on_response: F,
    ) -> Message {
        let message_id = context.message_id();
        let content = MessageContent::Text(TextContent { text });
        let bot_api_gateway = context.bot_api_gateway();
        let jwt = context.jwt().to_string();

        let action = BotAction::SendMessage(BotMessageAction {
            content: content.clone(),
            finalised,
        });

        let runtime = self.runtime.clone();
        self.runtime.spawn(async move {
            let response = runtime
                .execute_bot_action(bot_api_gateway, jwt, action.clone())
                .await;

            on_response(action, response);
        });

        Message {
            id: message_id,
            content,
            finalised,
        }
    }
}
