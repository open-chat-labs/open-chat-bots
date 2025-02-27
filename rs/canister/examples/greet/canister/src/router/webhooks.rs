mod create_channel;
mod delete_channel;
mod send_message;
use crate::state;
use oc_bots_sdk_canister::{env, HttpRequest, HttpResponse};

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let context =
        match state::read(|state| request.extract_context(state.oc_public_key(), env::now())) {
            Ok(cxt) => cxt,
            Err(response) => return response,
        };

    match request.path.trim_start_matches("/webhook/") {
        "create-channel" => create_channel::execute(request, context).await,
        "delete-channel" => delete_channel::execute(request, context).await,
        "send-message" => send_message::execute(request, context).await,
        _ => HttpResponse::not_found(),
    }
}
