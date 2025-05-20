use oc_bots_sdk::oc_api::actions::{delete_channel, ActionArgsBuilder};
use oc_bots_sdk::types::{AutonomousContext, AutonomousScope, CanisterId, ChannelId};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

#[derive(serde::Deserialize)]
struct Args {
    api_gateway: CanisterId,
    community_id: CanisterId,
    channel_id: ChannelId,
}

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let args: Args = match request.extract_args() {
        Ok(args) => args,
        Err(response) => return response,
    };

    let context = AutonomousContext {
        api_gateway: args.api_gateway,
        scope: AutonomousScope::Community(args.community_id),
    };

    let response = OPENCHAT_CLIENT_FACTORY
        .build(context)
        .delete_channel(args.channel_id)
        .execute_async()
        .await;

    match response {
        Ok(delete_channel::Response::Success) => HttpResponse::status(200),
        Err((code, message)) => HttpResponse::text(500, format!("{}: {}", code, message)),
        other => HttpResponse::text(500, format!("{:?}", other)),
    }
}
