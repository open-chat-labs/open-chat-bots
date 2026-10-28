use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::send_message;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, Chat, MessageContentInitial, MiniAppContent};
use oc_bots_sdk_offchain::AgentRuntime;
use std::sync::LazyLock;
use tracing::error;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Press::definition);

/// The card's text. It never changes: the counts are shown in the bot's app, which the card's Open
/// button opens.
pub const CARD_TEXT: &str = "**Button presses** · tap Open to play";

/// `/press` posts a card. Its counts start when someone first opens the card's app.
pub struct Press;

#[async_trait]
impl CommandHandler<AgentRuntime> for Press {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<AgentRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let (Some(chat), Some(message_id)) = (cxt.scope.chat(), cxt.scope.message_id()) else {
            return Err("The button can only be posted in a chat".to_string());
        };

        // OpenChat doesn't allow MiniApp messages in direct chats
        if matches!(chat, Chat::Direct(_)) {
            return Ok(EphemeralMessageBuilder::new(
                MessageContentInitial::from_text(
                    "The button can only be posted in groups and channels".to_string(),
                ),
                message_id,
            )
            .build()
            .into());
        }

        let message = oc_client
            .send_message(MessageContentInitial::MiniApp(MiniAppContent::new(
                CARD_TEXT,
            )))
            .execute_then_return_message(|_, response| {
                if !matches!(response, Ok(send_message::Response::Success(_))) {
                    error!("Failed to post the card: {response:?}");
                }
            });

        Ok(SuccessResult { message })
    }
}

impl Press {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "press".to_string(),
            description: Some("Post a button for everyone to press".to_string()),
            placeholder: Some("Fetching the button...".to_string()),
            params: Vec::new(),
            permissions: BotPermissions::from_message_permission(MessagePermission::MiniApp),
            default_role: None,
            direct_messages: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_card_is_valid() {
        assert_eq!(MiniAppContent::new(CARD_TEXT).validate(), Ok(()));
    }
}
