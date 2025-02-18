mod create_channel;
mod delete_channel;
mod send_message;
use crate::state;
use oc_bots_sdk::types::{AuthToken, BotApiKeyContext};
use oc_bots_sdk_canister::{env, HttpRequest, HttpResponse};
use serde::Deserialize;

pub async fn execute(request: HttpRequest) -> HttpResponse {
    match request.path.trim_start_matches("/webhook/") {
        "create-channel" => create_channel::execute(request).await,
        "delete-channel" => delete_channel::execute(request).await,
        "send-message" => send_message::execute(request).await,
        _ => HttpResponse::not_found(),
    }
}

fn extract_args<'a, Args: Deserialize<'a>>(request: &'a HttpRequest) -> Result<Args, HttpResponse> {
    match serde_json::from_slice(&request.body) {
        Ok(args) => Ok(args),
        Err(error) => Err(HttpResponse::text(400, format!("Args invalid: {}", error))),
    }
}

fn extract_context(auth_token: AuthToken) -> Result<BotApiKeyContext, HttpResponse> {
    let public_key = state::read(|state| state.oc_public_key().to_string());
    let now = env::now();

    BotApiKeyContext::parse(auth_token, &public_key, now)
        .map_err(|err| HttpResponse::text(400, format!("{err:?}")))
}
