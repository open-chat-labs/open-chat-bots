use oc_bots_sdk::{
    oc_api::actions::{create_channel, ActionArgsBuilder},
    types::{AutonomousContext, AutonomousScope, CanisterId},
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

#[derive(serde::Deserialize)]
struct Args {
    api_gateway: CanisterId,
    community_id: CanisterId,
    channel_name: String,
    is_public: bool,
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
