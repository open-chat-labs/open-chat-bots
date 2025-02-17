use oc_bots_sdk::{api::BadRequest, types::BotApiKeyContext};
use oc_bots_sdk_canister::map_create_channel_response;
use oc_bots_sdk_canister::Request as HttpRequest;
use oc_bots_sdk_canister::Response as HttpResponse;
use oc_bots_sdk_canister::OPENCHAT_CLIENT_FACTORY;

#[derive(serde::Deserialize)]
struct Args {
    channel_name: String,
    is_public: bool,
}

pub async fn execute(request: HttpRequest, context: BotApiKeyContext) -> HttpResponse {
    let args: Args = match serde_json::from_slice(&request.body) {
        Ok(args) => args,
        Err(_) => return HttpResponse::json(400, &BadRequest::ArgsInvalid),
    };

    let response = OPENCHAT_CLIENT_FACTORY
        .clone()
        .build_api_key_client(context)
        .create_channel(args.channel_name, args.is_public)
        .execute_async()
        .await;

    map_create_channel_response(response)
}
