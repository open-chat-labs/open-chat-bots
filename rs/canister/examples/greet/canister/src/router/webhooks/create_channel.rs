use oc_bots_sdk::{
    oc_api::actions::{create_channel, ActionArgsBuilder},
    types::{AutonomousContext, AutonomousScope, CommunityPermission, InstallationLocation},
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

use crate::state;

#[derive(serde::Deserialize)]
struct Args {
    api_key: String,
    channel_name: String,
    is_public: bool,
}

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let args: Args = match request.extract_args() {
        Ok(args) => args,
        Err(response) => return response,
    };

    let (location, installation) = match state::read(|state| {
        let location = state.installation_secrets.verify(&args.api_key).ok_or(())?;
        let installation = state.installation_registry.get(location).ok_or(())?;
        Ok((*location, installation.clone()))
    }) {
        Ok(tuple) => tuple,
        Err(()) => return HttpResponse::status(403),
    };

    let InstallationLocation::Community(community_id) = location else {
        return HttpResponse::status(403);
    };

    if !installation
        .granted_autonomous_permissions
        .community()
        .contains(if args.is_public {
            &CommunityPermission::CreatePublicChannel
        } else {
            &CommunityPermission::CreatePrivateChannel
        })
    {
        return HttpResponse::status(403);
    }

    let context = AutonomousContext {
        api_gateway: installation.api_gateway,
        scope: AutonomousScope::Community(community_id),
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
