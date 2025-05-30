use oc_bots_sdk::oc_api::actions::{delete_channel, ActionArgsBuilder};
use oc_bots_sdk::types::{AutonomousContext, AutonomousScope, ChannelId, InstallationLocation};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

use crate::state;

#[derive(serde::Deserialize)]
struct Args {
    api_key: String,
    channel_id: ChannelId,
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

    let InstallationLocation::Community(community_id) = location else {
        return HttpResponse::status(403);
    };

    let context = AutonomousContext {
        api_gateway,
        scope: AutonomousScope::Community(community_id),
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
