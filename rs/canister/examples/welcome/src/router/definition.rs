use super::commands;
use oc_bots_sdk::{
    api::definition::*,
    types::{BotPermissionsBuilder, ChatEventType},
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};
use std::collections::HashSet;

pub async fn get(_request: HttpRequest) -> HttpResponse {
    HttpResponse::json(
        200,
        &BotDefinition {
            description: "A bot that welcomes users to a chat with a custom message.".to_string(),
            commands: commands::definitions(),
            autonomous_config: Some(AutonomousConfig {
                permissions: BotPermissionsBuilder::new()
                    .with_message(MessagePermission::Text)
                    .with_chat(ChatPermission::ReadMembership)
                    .build(),
            }),
            default_subscriptions: Some(BotSubscriptions {
                community: HashSet::default(),
                chat: HashSet::from_iter(vec![ChatEventType::MembersJoined]),
            }),
            data_encoding: None,
        },
    )
}
