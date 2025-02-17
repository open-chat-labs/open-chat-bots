mod create_channel;
mod delete_channel;
mod send_message;
use crate::state;
use oc_bots_sdk_canister::{env, webhook_handler, Request, Response};

pub async fn execute(request: Request) -> Response {
    let public_key = state::read(|state| state.oc_public_key().to_string());
    let now = env::now();

    let cxt = match webhook_handler::extract_context(&request, &public_key, now) {
        Ok(cxt) => cxt,
        Err(err) => return Response::json(400, &err),
    };

    match request.path.trim_start_matches("/webhook/") {
        "create-channel" => create_channel::execute(request, cxt).await,
        "delete-channel" => delete_channel::execute(request, cxt).await,
        "send-message" => send_message::execute(request, cxt).await,
        _ => Response::not_found(),
    }
}
