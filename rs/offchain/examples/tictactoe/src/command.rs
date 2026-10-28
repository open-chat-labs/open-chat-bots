use crate::game::{Game, Games};
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::send_message;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, Chat, MessageContentInitial};
use oc_bots_sdk_offchain::AgentRuntime;
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
        let message_id = cxt
            .scope
            .message_id()
            .ok_or("Tic-tac-toe is played in a chat")?;

        // OpenChat doesn't allow MiniApp messages in direct chats, for now
        if matches!(cxt.scope.chat(), Some(Chat::Direct(_))) {
            let text = "Tic-tac-toe can only be played in groups and channels".to_string();
            return Ok(EphemeralMessageBuilder::new(
                MessageContentInitial::from_text(text),
                message_id,
            )
            .build()
            .into());
        }

        // Kept by the id of the message the lobby's posted in, which the game is played in
        let game = Game::new(cxt.command.initiator);
        let content = game.render();
        self.games.insert(message_id, game);

        let message = oc_client
            .send_message(MessageContentInitial::MiniApp(content))
            .execute_then_return_message(|_, response| {
                if !matches!(response, Ok(send_message::Response::Success(_))) {
                    error!("Failed to post a game: {response:?}");
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
