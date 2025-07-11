use oc_bots_sdk::{
    api::definition::*,
    types::{BotPermissionsBuilder, CommunityEventType},
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};
use std::collections::HashSet;

pub async fn get(_request: HttpRequest) -> HttpResponse {
    HttpResponse::json(
        200,
        &BotDefinition {
            description: "This bot assists admin of communities and groups.".to_string(),
            commands: vec![],
            autonomous_config: Some(AutonomousConfig {
                permissions: BotPermissionsBuilder::new()
                    .with_message(MessagePermission::Text)
                    .with_community(CommunityPermission::CreatePrivateChannel)
                    .with_community(CommunityPermission::InviteUsers)
                    .with_community(CommunityPermission::ReadMembership)
                    .with_community(CommunityPermission::ReadSummary)
                    .build(),
            }),
            default_subscriptions: Some(BotSubscriptions {
                chat: HashSet::default(),
                community: CommunityEventType::all(),
            }),
            data_encoding: None,
        },
    )
}
