use crate::games::GAMES;
use crate::model::engine::GameEngine;
use crate::state;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::send_message;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk_canister::{get_random_seed, CanisterRuntime};
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Start::definition);

pub struct Start;

#[async_trait]
impl CommandHandler<CanisterRuntime> for Start {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let chat = cxt.scope.chat().unwrap();
        let game = oc_client.context().command.arg("game");

        // Get a random seed using raw_rand
        let seed = get_random_seed().await;

        // Start the game
        let message = state::mutate(|state| {
            let mut new_game = GameEngine::new(game, seed);
            let output = new_game.start();
            state.engines.insert(*chat, new_game);
            output
        });

        // Send the message to OpenChat but don't wait for the response
        let message = oc_client
            .send_text_message(message)
            .execute_then_return_message(|args, response| match response {
                Ok(send_message::Response::Success(_)) => {}
                error => {
                    ic_cdk::println!("send message failed: {args:?}, {error:?}");
                }
            });

        Ok(SuccessResult { message })
    }
}

impl Start {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "start".to_string(),
            description: Some("This will start playing the named game in the chat. Any current game will be stopped.".to_string()),
            placeholder: None,
            params: vec![BotCommandParam {
                name: "game".to_string(),
                description: Some("The name of the game to play".to_string()),
                param_type: BotCommandParamType::StringParam(StringParam {
                    min_length: 3,
                    max_length: 30,
                    choices: GAMES.keys().map(|g| BotCommandOptionChoice { name: g.to_string(), value: g.to_string() }).collect(),
                    multi_line: false,
                }),
                required: true,
                placeholder: None,
            }],
            permissions: BotPermissions::text_only(),
            default_role: None,
            direct_messages: None,
        }
    }
}
