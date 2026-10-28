use crate::game::{Game, Games};
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::send_message;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, Chat, MessageContentInitial};
use oc_bots_sdk_offchain::{AgentRuntime, env};
use std::sync::{Arc, LazyLock};
use tracing::error;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(NewGame::definition);

/// `/tictactoe` posts a game's lobby, hosted by the user who ran it
pub struct NewGame {
    pub games: Arc<Games>,
}

#[async_trait]
impl CommandHandler<AgentRuntime> for NewGame {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<AgentRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let (Some(&chat), Some(message_id)) = (cxt.scope.chat(), cxt.scope.message_id()) else {
            return Err("Tic-tac-toe is played in a chat".to_string());
        };
        let reply = |text: &str| {
            Ok(EphemeralMessageBuilder::new(
                MessageContentInitial::from_text(text.to_string()),
                message_id,
            )
            .build()
            .into())
        };

        // OpenChat doesn't allow MiniApp messages in direct chats, for now
        if matches!(chat, Chat::Direct(_)) {
            return reply("Tic-tac-toe can only be played in groups and channels");
        }

        // Kept by where the lobby's posted, which the game is played in. The message id is the one
        // the user's client chose for the command, so it could be another game's.
        let key = (chat, cxt.scope.thread(), message_id);
        let game = Game::new(cxt.command.initiator);
        let content = game.render();
        if !self.games.insert(key, game, env::now()) {
            return reply("There's already a game in that message");
        }

        let games = self.games.clone();
        let message = oc_client
            .send_message(MessageContentInitial::MiniApp(content))
            .execute_then_return_message(move |_, response| {
                if !matches!(response, Ok(send_message::Response::Success(_))) {
                    error!("Failed to post a game: {response:?}");
                    games.remove(&key);
                }
            });

        Ok(SuccessResult { message })
    }
}

impl NewGame {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "tictactoe".to_string(),
            description: Some("Start a game of tic-tac-toe, for anyone to join".to_string()),
            placeholder: Some("Setting up the board...".to_string()),
            params: Vec::new(),
            permissions: BotPermissions::from_message_permission(MessagePermission::MiniApp),
            default_role: None,
            direct_messages: None,
        }
    }
}
