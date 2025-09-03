use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, ChatRole, MessageContentInitial};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

use crate::state;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(SetRule::definition);

pub struct SetRule;

#[async_trait]
impl CommandHandler<CanisterRuntime> for SetRule {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();

        let message = if let Some(community_id) = cxt.scope.community_id() {
            let emoji = cxt.command.arg("emoji");

            let channel_id = cxt.command.arg("channel");
            state::mutate(|state| {
                state
                    .communities
                    .entry(community_id)
                    .or_default()
                    .set_rule(emoji, channel_id);
            });
            "Rule set"
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

impl SetRule {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "set_rule".to_string(),
            description: Some("This will set a rule to map an emoji to a channel. Subsequently, if a message in the community is reacted to with that emoji, it will be copied to the specified channel.".to_string()),
            placeholder: None,
            params: vec![BotCommandParam {
                name: "emoji".to_string(),
                description: Some("The emoji used to map to a channel".to_string()),
                param_type: BotCommandParamType::StringParam(StringParam {
                    min_length: 1,
                    max_length: 100,
                    choices: Vec::new(),
                    multi_line: false,
                }),
                required: true,
                placeholder: None,
            }, BotCommandParam {
                name: "channel".to_string(),
                description: Some("The channel to map the emoji to".to_string()),
                placeholder: Some("channel".to_string()),
                required: true,
                param_type: BotCommandParamType::IntegerParam(IntegerParam {
                    min_value: 0,
                    max_value: u32::MAX.into(),
                    choices: Vec::new(),
                })
            }],
            permissions: BotPermissions::empty(),
            default_role: Some(ChatRole::Admin),
            direct_messages: Some(false),
        }
    }
}
