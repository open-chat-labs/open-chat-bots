use oc_bots_sdk::api::{BadRequest, Message};
use oc_bots_sdk::types::{BotCommandContext, TokenError};
use oc_bots_sdk::OpenChatClient;
use oc_bots_sdk_offchain::env::now;
use oc_bots_sdk_offchain::AgentRuntime;

pub mod coin;
pub mod roll;

pub async fn execute_command(
    jwt: String,
    oc_client: &OpenChatClient<AgentRuntime>,
    oc_public_key: &str,
) -> Result<Message, BadRequest> {
    let context = match BotCommandContext::parse(jwt, oc_public_key, now()) {
        Ok(c) => c,
        Err(bad_request) => {
            return Err(match bad_request {
                TokenError::Invalid(_) => BadRequest::AccessTokenInvalid,
                TokenError::Expired => BadRequest::AccessTokenExpired,
            });
        }
    };

    let command = context.command();
    match command.name.as_str() {
        "roll" => roll::execute(&command.args),
        "coin" => coin::execute(&command.args),
        _ => Err(BadRequest::CommandNotFound),
    }
    .map(|text| {
        oc_client
            .with_command_context(context)
            .send_text_message(text)
            .execute(|_, _| ())
    })
}
