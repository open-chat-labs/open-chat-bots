mod create_channel;
mod delete_channel;
mod send_message;
use crate::state;
use oc_bots_sdk::types::{BotApiKeyContext, TokenError};
use oc_bots_sdk_canister::{env, HttpRequest, HttpResponse};
use serde::Deserialize;

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let cxt = match extract_context(&request) {
        Ok(cxt) => cxt,
        Err(response) => return response,
    };

    match request.path.trim_start_matches("/webhook/") {
        "create-channel" => create_channel::execute(request, cxt).await,
        "delete-channel" => delete_channel::execute(request, cxt).await,
        "send-message" => send_message::execute(request, cxt).await,
        _ => HttpResponse::not_found(),
    }
}

fn extract_args<'a, Args: Deserialize<'a>>(request: &'a HttpRequest) -> Result<Args, HttpResponse> {
    match serde_json::from_slice(&request.body) {
        Ok(args) => Ok(args),
        Err(error) => Err(HttpResponse::text(400, format!("Args invalid: {}", error))),
    }
}

fn extract_context(request: &HttpRequest) -> Result<BotApiKeyContext, HttpResponse> {
    if let Some(jwt) = request.get_header("x-oc-jwt") {
        let public_key = state::read(|state| state.oc_public_key().to_string());
        let now = env::now();
        BotApiKeyContext::parse_jwt(jwt.to_string(), &public_key, now)
    } else if let Some(api_key) = request.get_header("x-oc-api-key") {
        BotApiKeyContext::parse_api_key(api_key.to_string())
    } else {
        Err(TokenError::Invalid("No auth token found".to_string()))
    }
    .map_err(|err| HttpResponse::text(400, format!("{err:?}")))
}
