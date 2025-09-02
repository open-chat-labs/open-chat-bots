use super::commands;
use oc_bots_sdk::{
    api::definition::*,
    types::{BotPermissionsBuilder, ChatEventType, InstallationLocationType},
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};
use std::collections::HashSet;

pub async fn get(_request: HttpRequest) -> HttpResponse {
    HttpResponse::json(
        200,
        &BotDefinition {
            description:
                "A bot that allows users to set up reaction-based channeling rules in a chat."
                    .to_string(),
            commands: commands::definitions(),
            autonomous_config: Some(AutonomousConfig {
                permissions: BotPermissionsBuilder::new()
                    .with_message(MessagePermission::Text)
                    .with_chat(ChatPermission::ReadMessages)
                    .build(),
            }),
            default_subscriptions: Some(BotSubscriptions {
                community: HashSet::default(),
                chat: HashSet::from_iter([ChatEventType::MessageReaction, ChatEventType::Message]),
            }),
            data_encoding: None,
            restricted_locations: Some(HashSet::from([InstallationLocationType::Community])),
        },
    )
}
