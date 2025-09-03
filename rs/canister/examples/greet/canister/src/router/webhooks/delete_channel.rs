use oc_bots_sdk::oc_api::actions::{ActionArgsBuilder, delete_channel};
use oc_bots_sdk::types::{
    ActionScope, AutonomousContext, CanisterId, ChannelId, InstallationLocation,
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

#[derive(serde::Deserialize)]
struct Args {
    channel_id: ChannelId,
}

pub async fn execute(
    request: HttpRequest,
    api_gateway: CanisterId,
    location: InstallationLocation,
) -> HttpResponse {
    let args: Args = match request.extract_args() {
        Ok(args) => args,
        Err(response) => return response,
    };

    let InstallationLocation::Community(community_id) = location else {
        return HttpResponse::status(400);
    };

    let context = AutonomousContext {
        api_gateway,
        scope: ActionScope::Community(community_id),
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
