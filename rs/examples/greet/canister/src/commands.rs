use crate::state;
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk::{
    api::{BadRequest, CommandResponse},
    types::TokenError,
};
use oc_bots_sdk_canister::env::now;

pub mod greet;
pub mod joke;

pub async fn execute_command(jwt: &str) -> CommandResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());

    let context = match BotCommandContext::parse(jwt.to_string(), &public_key, now()) {
        Ok(a) => a,
        Err(bad_request) => {
            return match bad_request {
                TokenError::Invalid(_) => {
                    CommandResponse::BadRequest(BadRequest::AccessTokenInvalid)
                }
                TokenError::Expired => CommandResponse::BadRequest(BadRequest::AccessTokenExpired),
            }
        }
    };

    let result = match context.command().name.as_str() {
        "greet" => greet::execute(context),
        "joke" => joke::execute(context),
        _ => return CommandResponse::BadRequest(BadRequest::CommandNotFound),
    };

    match result {
        Ok(success) => CommandResponse::Success(success),
        Err(internal_error) => CommandResponse::InternalError(internal_error),
    }
}
