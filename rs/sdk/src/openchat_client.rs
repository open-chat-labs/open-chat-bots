use crate::api::{GetAccessTokenArgs, GetAccessTokenResponse};
use crate::api_key::extract_gateway_from_api_key;
use crate::openchat_client::api_key::OpenChatClientForApiKey;
use crate::openchat_client::command::OpenChatClientForCommand;
use crate::runtime::Runtime;
use crate::types::{BotApiKeyContext, BotCommandContext, CallResult};
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

    pub async fn get_access_token(&self, api_key: String) -> CallResult<String> {
        let gateway = extract_gateway_from_api_key(&api_key)
            .map_err(|error| (0, format!("Failed to decode ApiKey: {error}")))?;

        let (response,): (GetAccessTokenResponse,) = self
            .runtime
            .call_canister(
                gateway,
                "access_token_v2",
                (GetAccessTokenArgs::BotActionByApiKey(api_key),),
            )
            .await?;

        match response {
            GetAccessTokenResponse::Success(jwt) => Ok(jwt),
            GetAccessTokenResponse::NotAuthorized => {
                Err((0, "Failed to get access token: NotAuthorized".to_string()))
            }
            GetAccessTokenResponse::InternalError(error) => {
                Err((0, format!("Failed to get access token: {error}")))
            }
        }
    }

    pub fn with_command_context(&self, context: BotCommandContext) -> OpenChatClientForCommand<R> {
        OpenChatClientForCommand::new(self.runtime.clone(), context)
    }

    pub fn with_api_key_context(&self, context: BotApiKeyContext) -> OpenChatClientForApiKey<R> {
        OpenChatClientForApiKey::new(self.runtime.clone(), context)
    }
}
