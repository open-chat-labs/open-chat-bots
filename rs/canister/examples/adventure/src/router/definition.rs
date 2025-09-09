use super::commands;
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};

pub async fn get(_request: HttpRequest) -> HttpResponse {
    HttpResponse::json(
        200,
        &BotDefinition {
            description:
                "This bot allows users to play a selection of classic text-based adventures in a chat."
                    .to_string(),
            commands: commands::definitions(),
            autonomous_config: None,
            default_subscriptions: None,
            data_encoding: None,
            restricted_locations: None,
        },
    )
}
