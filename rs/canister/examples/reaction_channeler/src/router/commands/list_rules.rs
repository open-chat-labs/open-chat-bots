use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, ChatRole, MessageContentInitial};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

use crate::state;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(ListRules::definition);

pub struct ListRules;

#[async_trait]
impl CommandHandler<CanisterRuntime> for ListRules {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();

        let message = if let Some(community_id) = cxt.scope.community_id() {
            state::mutate(|state| {
                state
                    .communities
                    .get(&community_id)
                    .map(|community| {
                        community
                            .get_rules()
                            .iter()
                            .map(|(emoji, channel)| format!("{} -> #Channel({})", emoji, channel))
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .unwrap_or_else(|| "No rules found".to_string())
            })
        } else {
            "This command can only be used in a community context".to_string()
        };

        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(message),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
    }
}

impl ListRules {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "list_rules".to_string(),
            description: Some("This will list the current rules.".to_string()),
            placeholder: None,
            params: vec![],
            permissions: BotPermissions::empty(),
            default_role: Some(ChatRole::Admin),
            direct_messages: Some(false),
        }
    }
}
