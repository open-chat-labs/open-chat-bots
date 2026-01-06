use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::{ActionArgsBuilder, change_role};
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, ChatRole, MessageContentInitial, UserId};
use oc_bots_sdk_canister::CanisterRuntime;
use std::str::FromStr;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(ChangeRole::definition);

pub struct ChangeRole;

#[async_trait]
impl CommandHandler<CanisterRuntime> for ChangeRole {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let user_id: UserId = cxt.command.arg("User");
        let role_str: String = cxt.command.arg("New role");
        let Ok(new_role) = ChatRole::from_str(&role_str) else {
            return Err(format!("Invalid role: {role_str}").to_string());
        };

        let text = match oc_client
            .change_role(vec![user_id], new_role)
            .execute_async()
            .await
        {
            Ok(change_role::Response::Success) => format!("Role changed to {role_str}"),
            response => format!("Failed to change role: {:?}", response),
        };

        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(text.to_string()),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
    }
}

impl ChangeRole {
    fn definition() -> BotCommandDefinition {
        let roles = ["Owner", "Admin", "Moderator", "Member"];

        BotCommandDefinition {
            name: "change_role".to_string(),
            description: Some("Change the role of the given chat member".to_string()),
            placeholder: None,
            params: vec![
                BotCommandParam {
                    name: "User".to_string(),
                    description: Some("The member whose role is being changed".to_string()),
                    param_type: BotCommandParamType::UserParam,
                    required: true,
                    placeholder: None,
                },
                BotCommandParam {
                    name: "New role".to_string(),
                    description: Some("The new role".to_string()),
                    param_type: BotCommandParamType::StringParam(StringParam {
                        min_length: 5,
                        max_length: 16,
                        choices: roles
                            .into_iter()
                            .map(|role| BotCommandOptionChoice {
                                name: role.to_string(),
                                value: role.to_string(),
                            })
                            .collect(),
                        multi_line: false,
                    }),
                    required: true,
                    placeholder: None,
                },
            ],
            permissions: BotPermissions::from_chat_permission(ChatPermission::ChangeRoles),
            default_role: Some(ChatRole::Admin),
            direct_messages: Some(false),
        }
    }
}
