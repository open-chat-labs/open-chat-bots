use std::collections::HashSet;

use super::commands;
use oc_bots_sdk::{api::definition::*, types::InstallationLocationType};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};

pub async fn get(_request: HttpRequest) -> HttpResponse {
    HttpResponse::json(
        200,
        &BotDefinition {
            description:
                "This is a minimal canister bot for testing purposes with a single 'echo' command."
                    .to_string(),
            commands: commands::definitions(),
            autonomous_config: None,
            default_subscriptions: None,
            restricted_locations: Some(HashSet::from([
                InstallationLocationType::User,
                InstallationLocationType::Group,
            ])),
        },
    )
}
