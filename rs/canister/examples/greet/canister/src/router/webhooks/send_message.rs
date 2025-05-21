use oc_bots_sdk::oc_api::actions::{send_message, ActionArgsBuilder};
use oc_bots_sdk::types::{
    AutonomousContext, AutonomousScope, BotPermissions, ChannelId, MessageContentInitial,
    TextContent,
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

    let (location, installation) = match state::read(|state| {
        let location = state.installation_secrets.verify(&args.api_key).ok_or(())?;
        let installation = state.installation_registry.get(location).ok_or(())?;
        Ok((*location, installation.clone()))
    }) {
        Ok(tuple) => tuple,
        Err(()) => return HttpResponse::status(403),
    };

    if !BotPermissions::text_only().is_subset(&installation.granted_autonomous_permissions) {
        return HttpResponse::status(403);
    };

    let context = AutonomousContext {
        api_gateway: installation.api_gateway,
        scope: AutonomousScope::from_location(&location, args.channel_id),
    };

    if matches!(context.scope, AutonomousScope::Community(_)) {
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
