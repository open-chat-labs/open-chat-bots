use oc_bots_sdk::types::{MessageContent, TextContent};
use oc_bots_sdk::{api::BadRequest, types::BotApiKeyContext};
use oc_bots_sdk_canister::map_send_message_response;
use oc_bots_sdk_canister::Request as HttpRequest;
use oc_bots_sdk_canister::Response as HttpResponse;
use oc_bots_sdk_canister::OPENCHAT_CLIENT_FACTORY;

#[derive(serde::Deserialize)]
struct Args {
    text: String,
}

pub async fn execute(request: HttpRequest, context: BotApiKeyContext) -> HttpResponse {
    let args: Args = match serde_json::from_slice(&request.body) {
        Ok(args) => args,
        Err(_) => return HttpResponse::json(400, &BadRequest::ArgsInvalid),
    };

    let response = OPENCHAT_CLIENT_FACTORY
        .clone()
        .build_api_key_client(context)
        .send_message(MessageContent::Text(TextContent { text: args.text }))
        .execute_async()
        .await;

    map_send_message_response(response)
}
