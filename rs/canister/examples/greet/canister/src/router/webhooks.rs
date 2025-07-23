use crate::state;
mod create_channel;
mod delete_channel;
mod send_message;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let Some(api_key) = request.get_header("x-oc-api-key") else {
        return HttpResponse::status(401);
    };

    let Some((api_gateway, location)) = state::read(|state| state.api_key_registry.lookup(api_key))
    else {
        return HttpResponse::status(403);
    };

    match request.path.trim_start_matches("/webhook/") {
        "create-channel" => create_channel::execute(request, api_gateway, location).await,
        "delete-channel" => delete_channel::execute(request, api_gateway, location).await,
        "send-message" => send_message::execute(request, api_gateway, location).await,
        _ => HttpResponse::not_found(),
    }
}
