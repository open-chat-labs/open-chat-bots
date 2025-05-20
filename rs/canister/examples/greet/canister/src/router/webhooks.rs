mod create_channel;
mod delete_channel;
mod send_message;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};

pub async fn execute(request: HttpRequest) -> HttpResponse {
    match request.path.trim_start_matches("/webhook/") {
        "create-channel" => create_channel::execute(request).await,
        "delete-channel" => delete_channel::execute(request).await,
        "send-message" => send_message::execute(request).await,
        _ => HttpResponse::not_found(),
    }
}
