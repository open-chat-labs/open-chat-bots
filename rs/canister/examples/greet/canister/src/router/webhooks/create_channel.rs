use oc_bots_sdk::{
    oc_api::actions::{ActionArgsBuilder, create_channel},
    types::{ActionScope, AutonomousContext, CanisterId, InstallationLocation},
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

#[derive(serde::Deserialize)]
struct Args {
    channel_name: String,
    is_public: bool,
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
        .create_channel(args.channel_name, args.is_public)
        .execute_async()
        .await;

    match response {
        Ok(create_channel::Response::Success(result)) => {
            HttpResponse::text(200, result.channel_id.to_string())
        }
        Err((code, message)) => HttpResponse::text(500, format!("{}: {}", code, message)),
        other => HttpResponse::text(500, format!("{:?}", other)),
    }
}
