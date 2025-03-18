use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::BotCommandDefinition;
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::{
    BotCommandContext, BotCommandScope, BotPermissions, ChatRole, MessageContentInitial,
};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

use crate::state;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(List::definition);

pub struct List;

#[async_trait]
impl CommandHandler<CanisterRuntime> for List {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        cxt: BotCommandContext,
        _oc_client_factory: &ClientFactory<CanisterRuntime>,
    ) -> Result<SuccessResult, String> {
        let list = state::read(|state| {
            // Extract the chat
            let BotCommandScope::Chat(chat_scope) = &cxt.scope else {
                return Err("This command can only be used in a chat".to_string());
            };

            Ok(state.reminders.list(&chat_scope.chat))
        })?;

        let mut text = String::new();

        if list.is_empty() {
            text.push_str("No reminders set in this chat");
        } else {
            for reminder in list {
                text.push_str(&format!("{}\n", reminder.to_text()));
            }
        }

        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(text),
            cxt.scope.message_id().unwrap(),
        )
        .build()
        .into())
    }
}

impl List {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "list_reminders".to_string(),
            description: Some("List the reminders set in this chat with their IDs".to_string()),
            placeholder: None,
            params: vec![],
            permissions: BotPermissions::default(),
            default_role: Some(ChatRole::Admin),
            direct_messages: false,
        }
    }
}
