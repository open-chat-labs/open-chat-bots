use crate::state;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Input::definition);

pub struct Input;

#[async_trait]
impl CommandHandler<CanisterRuntime> for Input {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let chat = cxt.scope.chat().unwrap();
        let text = oc_client.context().command.arg("text");

        let game_response = state::mutate(|state| {
            if let Some(resp) = state
                .engines
                .get_mut(chat)
                .map_or(Some("No game started yet".to_string()), |engine| {
                    engine.input(text)
                })
            {
                resp
            } else {
                state.engines.remove(chat);
                "Game over. Start a new game with /start".to_string()
            }
        });

        let message = oc_client
            .send_text_message(game_response)
            .execute_then_return_message(|args, response| {
                if let Err(e) = response {
                    ic_cdk::println!("send message failed: {args:?}, {e:?}");
                }
            });

        Ok(SuccessResult { message })
    }
}

impl Input {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "input".to_string(),
            description: Some("This will input a move into the current game.".to_string()),
            placeholder: None,
            params: vec![BotCommandParam {
                name: "text".to_string(),
                description: Some("The text to input".to_string()),
                param_type: BotCommandParamType::StringParam(StringParam {
                    min_length: 0,
                    max_length: 100,
                    choices: vec![],
                    multi_line: false,
                }),
                required: true,
                placeholder: None,
            }],
            permissions: BotPermissions::text_only(),
            default_role: None,
            direct_messages: Some(true),
        }
    }
}
