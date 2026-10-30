use crate::bot::Bot;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::actions::mini_app_post_token;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{
    BotCommandContext, Chat, MessageContentInitial, MiniAppContent, MiniAppGame,
};
use oc_bots_sdk_offchain::{AgentRuntime, env};
use std::sync::{Arc, LazyLock};
use tracing::error;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Chess::definition);

/// The card's text. It never changes: the board is in the bot's app, which the card's Open button
/// opens, while the card lists the players, whose move it is, and the result.
pub const CARD_TEXT: &str = "**Chess** · 10 minutes each";

/// `/chess` posts a card, through the MiniApp service
pub struct Chess {
    pub bot: Arc<Bot>,
}

#[async_trait]
impl CommandHandler<AgentRuntime> for Chess {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<AgentRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let (Some(chat), Some(message_id)) = (cxt.scope.chat(), cxt.scope.message_id()) else {
            return Err("A game can only be posted in a chat".to_string());
        };

        // OpenChat doesn't allow MiniApp cards in direct chats
        if matches!(chat, Chat::Direct(_)) {
            return Ok(EphemeralMessageBuilder::new(
                MessageContentInitial::from_text(
                    "Chess can only be played in groups and channels".to_string(),
                ),
                message_id,
            )
            .build()
            .into());
        }

        let card = card();

        // The token names the card's message, the command's, so the game is known, and ready for
        // joins, before the card is posted
        let token = match oc_client.mini_app_post_token().execute_async().await {
            Ok(mini_app_post_token::Response::Success(token)) => token,
            other => return Err(format!("Couldn't get a post token: {other:?}")),
        };
        let game = MiniAppGame::from_post_token(&token).map_err(|error| error.to_string())?;
        self.bot.games.posted(game, env::now());

        // The service posts the card as the bot, and records the game, which takes a moment, so
        // the command is answered meanwhile. The service verifies the token, so a failure is only
        // logged: the user sees no card, and can run the command again.
        let bot = self.bot.clone();
        let api_gateway = cxt.api_gateway;
        tokio::spawn(async move {
            let mini_apps = bot.mini_apps_via(api_gateway).await;
            if let Err(error) = mini_apps.post(&token, card, false, None).await {
                error!("Failed to post the card for {game:?}: {error}");
            }
        });

        // The SDK only builds a command's message for one the bot sends itself, so the command is
        // answered without one: the card arrives from the service, as the command's message
        Ok(SuccessResult { message: None })
    }
}

/// The card: two players, and anyone can watch
pub fn card() -> MiniAppContent {
    MiniAppContent::new(CARD_TEXT)
        .with_max_players(2)
        .with_spectators(true)
}

impl Chess {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "chess".to_string(),
            description: Some("Post a game of chess, 10 minutes each".to_string()),
            placeholder: Some("Setting up the board...".to_string()),
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
        assert_eq!(card().validate(), Ok(()));
        assert_eq!(card().max_players, Some(2));
    }
}
