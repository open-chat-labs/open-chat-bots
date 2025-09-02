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
            description: "This is a very basic example moderation bot which will auto delete any messages containing words in its banned list.".to_string(),
            commands: vec![],
            autonomous_config: Some(AutonomousConfig {
                permissions: BotPermissionsBuilder::new()
                    .with_message(MessagePermission::Text)
                    .with_chat(ChatPermission::ReadMessages)
                    .with_chat(ChatPermission::DeleteMessages)
                    .build(),
            }),
            default_subscriptions: Some(BotSubscriptions {
                community: HashSet::new(),
                chat: HashSet::from_iter(vec![ChatEventType::Message, ChatEventType::MessageEdited]),
            }),
            data_encoding: None,
            restricted_locations: Some(HashSet::from([
                InstallationLocationType::Community,
                InstallationLocationType::Group,
            ])),
        },
    )
}
