use oc_bots_sdk::types::{BotAction, BotApiKeyContext};
use oc_bots_sdk_canister::{env, OPENCHAT_CLIENT};

mod http_request;
mod lifecycle;
mod memory;
mod state;

async fn execute_action_with_api_key(action: BotAction, api_key: String) {
    let jwt = OPENCHAT_CLIENT.get_access_token(api_key).await.unwrap();
    execute_action_with_jwt(action, jwt).await;
}

async fn execute_action_with_jwt(action: BotAction, jwt: String) {
    let oc_public_key = state::read(|s| s.oc_public_key().to_string());
    let context = BotApiKeyContext::parse(jwt, &oc_public_key, env::now()).unwrap();

    OPENCHAT_CLIENT
        .with_api_key_context(context)
        .execute_bot_action(action)
        .await
        .unwrap()
        .0
        .unwrap();
}
