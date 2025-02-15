use super::commands;
use oc_bots_sdk::api::BotDefinition;
use oc_bots_sdk_canister::{Request, Response};

pub async fn get(_request: Request) -> Response {
    Response::json(
        200,
        &BotDefinition {
            description: "This bot can greet you, tell jokes, and generate fractal images!"
                .to_string(),
            commands: commands::definitions(),
            autonomous_config: None,
        },
    )
}
