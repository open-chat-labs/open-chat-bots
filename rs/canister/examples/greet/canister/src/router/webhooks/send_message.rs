use oc_bots_sdk::oc_api::actions::{send_message, ActionArgsBuilder};
use oc_bots_sdk::types::{
    AutonomousContext, ActionScope, ChannelId, MessageContentInitial, TextContent,
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

use crate::state;

#[derive(serde::Deserialize)]
struct Args {
    api_key: String,
    channel_id: Option<ChannelId>,
    text: String,
}

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let args: Args = match request.extract_args() {
        Ok(args) => args,
        Err(response) => return response,
    };

    let Some((api_gateway, location)) =
        state::read(|state| state.installation_secrets.lookup(&args.api_key))
    else {
        return HttpResponse::status(403);
    };

    let context = AutonomousContext {
        api_gateway,
        scope: ActionScope::from_location(&location, args.channel_id),
    };

    if matches!(context.scope, ActionScope::Community(_)) {
        return HttpResponse::status(403);
    }

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
