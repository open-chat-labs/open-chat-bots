use super::commands;
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};
use std::collections::HashSet;

pub async fn get(_request: HttpRequest) -> HttpResponse {
    HttpResponse::json(
        200,
        &BotDefinition {
            description: "This bot can greet you, tell jokes, and generate fractal images!"
                .to_string(),
            commands: commands::definitions(),
            autonomous_config: Some(AutonomousConfig {
                permissions: BotPermissions::default()
                    .with_community(&HashSet::from_iter(vec![
                        CommunityPermission::CreatePublicChannel,
                        CommunityPermission::CreatePrivateChannel,
                    ]))
                    .with_message(&HashSet::from_iter(vec![MessagePermission::Text])),
                sync_api_key: false,
            }),
        },
    )
}
