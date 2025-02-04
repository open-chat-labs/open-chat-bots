use crate::api::Message;
use crate::types::{
    ActionResponse, BotAction, BotCommandContext, BotMessageAction, CallResult, MessageContent,
    TextContent,
};
use crate::Runtime;
use std::sync::Arc;

pub struct OpenChatClientForCommand<R> {
    runtime: Arc<R>,
    context: BotCommandContext,
}

impl<R: Runtime + Send + Sync + 'static> OpenChatClientForCommand<R> {
    pub fn new(runtime: Arc<R>, context: BotCommandContext) -> Self {
        OpenChatClientForCommand { runtime, context }
    }

    pub fn send_text_message<
        F: FnOnce(BotAction, CallResult<(ActionResponse,)>) + Send + Sync + 'static,
    >(
        &self,
        text: String,
        finalised: bool,
        on_response: F,
    ) -> Message {
        let message_id = self.context.chat_scope().unwrap().message_id;
        let content = MessageContent::Text(TextContent { text });
        let action = BotAction::SendMessage(BotMessageAction {
            content: content.clone(),
            finalised,
        });

        self.execute_bot_action(action, on_response);

        Message {
            id: message_id,
            content,
            finalised,
        }
    }

    pub fn execute_bot_action<
        F: FnOnce(BotAction, CallResult<(ActionResponse,)>) + Send + Sync + 'static,
    >(
        &self,
        action: BotAction,
        on_response: F,
    ) {
        let bot_api_gateway = self.context.bot_api_gateway();
        let jwt = self.context.jwt().to_string();

        let runtime = self.runtime.clone();
        self.runtime.spawn(async move {
            let response = runtime
                .execute_bot_action(bot_api_gateway, jwt, action.clone())
                .await;

            on_response(action, response);
        });
    }
}
