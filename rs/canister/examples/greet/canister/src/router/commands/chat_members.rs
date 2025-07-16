use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::members::{MemberType, Response};
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, MessageContentInitial};
use oc_bots_sdk_canister::CanisterRuntime;
use std::collections::HashSet;
use std::str::FromStr;
use std::sync::LazyLock;
use strum::IntoEnumIterator;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(ChatMembers::definition);

pub struct ChatMembers;

#[async_trait]
impl CommandHandler<CanisterRuntime> for ChatMembers {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let member_type_str = cxt.command.arg::<String>("type");
        let Ok(member_type) = MemberType::from_str(&member_type_str) else {
            return Err(format!("Invalid member type: {member_type_str}"));
        };

        let message_id = cxt.scope.message_id();
        let channel_id = cxt.scope.channel_id();

        match oc_client
            .members(HashSet::from_iter([member_type]))
            .in_channel(channel_id)
            .execute_async()
            .await
        {
            Ok(Response::Success(result)) => {
                let text = result
                    .members_map
                    .get(&member_type)
                    .map(|user_ids| {
                        user_ids
                            .iter()
                            .map(|user_id| format!("@UserId({user_id})"))
                            .collect::<Vec<_>>()
                            .join(", ")
                    })
                    .unwrap_or_else(|| "No matches found".into());

                // Reply to the initiator with an ephemeral message
                Ok(EphemeralMessageBuilder::new(
                    MessageContentInitial::from_text(text),
                    message_id.unwrap(),
                )
                .build()
                .into())
            }
            Ok(Response::Error(error)) => Err(format!("Error calling bot_members: {error:?}")),
            Err(error) => Err(format!("C2C error calling bot_members: {error:?}")),
        }
    }
}

impl ChatMembers {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "chat_members".to_string(),
            description: Some("This will list the members of the chat".to_string()),
            placeholder: Some("Please wait".to_string()),
            params: vec![BotCommandParam {
                name: "type".to_string(),
                description: Some("The type of member to list".to_string()),
                placeholder: Some("Choose the type of member e.g. Admin".to_string()),
                required: true,
                param_type: BotCommandParamType::StringParam(StringParam {
                    min_length: 1,
                    max_length: 1000,
                    choices: MemberType::iter()
                        .map(|t| {
                            let choice = format!("{t:?}");
                            BotCommandOptionChoice {
                                name: choice.clone(),
                                value: choice,
                            }
                        })
                        .collect(),
                    multi_line: false,
                }),
            }],
            permissions: BotPermissions::from_chat_permission(ChatPermission::ReadMembership),
            default_role: None,
            direct_messages: None,
        }
    }
}
