use oc_bots_sdk::api::delete_channel;
use oc_bots_sdk::types::AuthToken;
use oc_bots_sdk::types::ChannelId;
use oc_bots_sdk_canister::HttpRequest;
use oc_bots_sdk_canister::HttpResponse;
use oc_bots_sdk_canister::OPENCHAT_CLIENT_FACTORY;

#[derive(serde::Deserialize)]
struct Args {
    channel_id: ChannelId,
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
        .delete_channel(args.channel_id)
        .execute_async()
        .await;

    match response {
        Ok(delete_channel::Response::Success) => HttpResponse::status(200),
        Err((code, message)) => HttpResponse::text(500, format!("{}: {}", code, message)),
        other => HttpResponse::text(500, format!("{:?}", other)),
    }
}
