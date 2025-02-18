use oc_bots_sdk::api::send_message;
use oc_bots_sdk::types::{AuthToken, MessageContent, TextContent};
use oc_bots_sdk::ActionArgsBuilder;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

#[derive(serde::Deserialize)]
struct Args {
    text: String,
    auth_token: AuthToken,
}

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let args: Args = match super::extract_args(&request) {
        Ok(args) => args,
        Err(response) => return response,
    };

    let context = match super::extract_context(args.auth_token) {
        Ok(cxt) => cxt,
        Err(response) => return response,
    };

    let response = OPENCHAT_CLIENT_FACTORY
        .build_api_key_client(context)
        .send_message(MessageContent::Text(TextContent { text: args.text }))
        .execute_async()
        .await;

    match response {
        Ok(send_message::Response::Success(result)) => HttpResponse::json(200, &result),
        Err((code, message)) => HttpResponse::text(500, format!("{}: {}", code, message)),
        other => HttpResponse::text(500, format!("{:?}", other)),
    }
}
