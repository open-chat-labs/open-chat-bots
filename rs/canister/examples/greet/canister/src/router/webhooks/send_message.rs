use oc_bots_sdk::oc_api::actions::{send_message, ActionArgsBuilder};
use oc_bots_sdk::types::{
    AutonomousContext, AutonomousScope, CanisterId, Chat, MessageContentInitial, TextContent,
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

#[derive(serde::Deserialize)]
struct Args {
    api_gateway: CanisterId,
    chat: Chat,
    text: String,
}

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let args: Args = match request.extract_args() {
        Ok(args) => args,
        Err(response) => return response,
    };

    let context = AutonomousContext {
        api_gateway: args.api_gateway,
        scope: AutonomousScope::Chat(args.chat),
    };

    let response = OPENCHAT_CLIENT_FACTORY
        .build(context)
        .send_message(MessageContentInitial::Text(TextContent { text: args.text }))
        .execute_async()
        .await;

    match response {
        Ok(send_message::Response::Success(result)) => HttpResponse::json(200, &result),
        Err((code, message)) => HttpResponse::text(500, format!("{}: {}", code, message)),
        other => HttpResponse::text(500, format!("{:?}", other)),
    }
}
