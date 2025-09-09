use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, ChatRole, MessageContentInitial};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

use crate::state;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(DeleteRule::definition);

pub struct DeleteRule;

#[async_trait]
impl CommandHandler<CanisterRuntime> for DeleteRule {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();

        let message = if let Some(community_id) = cxt.scope.community_id() {
            let emoji: String = cxt.command.arg("emoji");
            state::mutate(|state| {
                if let Some(community) = state.communities.get_mut(&community_id) {
                    community.delete_rule(&emoji);
                }
            });
            "Rule deleted"
        } else {
            "This command can only be used in a community context"
        };

        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(message.to_string()),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
    }
}

impl DeleteRule {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "delete_rule".to_string(),
            description: Some("This will delete a rule with the given emoji".to_string()),
            placeholder: None,
            params: vec![BotCommandParam {
                name: "emoji".to_string(),
                description: Some("The emoji used to identify the rule".to_string()),
                param_type: BotCommandParamType::StringParam(StringParam {
                    min_length: 1,
                    max_length: 100,
                    choices: Vec::new(),
                    multi_line: false,
                }),
                required: true,
                placeholder: None,
            }],
            permissions: BotPermissions::empty(),
            default_role: Some(ChatRole::Admin),
            direct_messages: Some(false),
        }
    }
}
