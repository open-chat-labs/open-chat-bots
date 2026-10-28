use crate::game::{Games, PressError};
use async_trait::async_trait;
use oc_bots_sdk::api::action::{ActionHandler, ActionResponse, ButtonPress};
use oc_bots_sdk::oc_api::Runtime;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::types::UnitResult;
use std::sync::Arc;

/// Plays each button press on a game's message, then edits the message to show it
pub struct PlayTicTacToe {
    pub games: Arc<Games>,
}

#[async_trait]
impl<R: Runtime> ActionHandler<R> for PlayTicTacToe {
    async fn execute(&self, press: ButtonPress<R>) -> ActionResponse {
        let message_id = press.session.message_id;

        // Eg. the bot was restarted, as it keeps games in memory
        let Some(game) = self.games.get(message_id) else {
            return ActionResponse::reply("This game isn't running any more");
        };

        // Held until the message is edited, so that the edits land in the order of the moves
        let mut game = game.lock().await;

        match game.press(press.user_id(), &press.button_id) {
            Ok(()) => {}
            Err(PressError::Reply(text)) => return ActionResponse::reply(text),
            Err(PressError::InvalidButton) => {
                return ActionResponse::bad_request(format!(
                    "{} isn't a button in this game now",
                    press.button_id
                ));
            }
        }

        if game.is_over() {
            self.games.remove(message_id);
        }

        match press.edit_message(game.render()).execute_async().await {
            Ok(UnitResult::Success) => ActionResponse::ok(),
            Ok(UnitResult::Error(error)) => {
                ActionResponse::internal_error(format!("Failed to edit the game: {error:?}"))
            }
            Err((code, message)) => ActionResponse::internal_error(format!(
                "Failed to edit the game: {code}: {message}"
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::Game;
    use ic_principal::Principal;
    use oc_bots_sdk::api::action::ActionSuccess;
    use oc_bots_sdk::msgpack;
    use oc_bots_sdk::oc_api::client::Client;
    use oc_bots_sdk::types::{
        BotMessageSession, CallResult, CanisterId, Chat, MessageContentInitial, MessageId,
        TimestampMillis, UserId,
    };
    use serde::{Deserialize, Serialize};
    use std::future::Future;
    use std::sync::Mutex;

    // Records each call's method and args, as JSON, and answers it with success
    #[derive(Default)]
    struct Recording {
        calls: Mutex<Vec<(String, serde_json::Value)>>,
    }

    impl Runtime for Recording {
        async fn call_canister<A: Serialize + Send, T: for<'a> Deserialize<'a>>(
            &self,
            _: CanisterId,
            method_name: &str,
            args: A,
        ) -> CallResult<T> {
            self.calls
                .lock()
                .unwrap()
                .push((method_name.to_string(), serde_json::to_value(args).unwrap()));
            Ok(msgpack::deserialize_then_unwrap(
                &msgpack::serialize_then_unwrap(UnitResult::Success),
            ))
        }

        fn spawn<F: Future<Output = ()> + Send + 'static>(&self, _: F) {
            unimplemented!()
        }

        fn now(&self) -> TimestampMillis {
            0
        }

        fn is_canister(&self) -> bool {
            false
        }
    }

    const MESSAGE_ID: u64 = 99;

    fn user(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    struct Test {
        runtime: Arc<Recording>,
        handler: PlayTicTacToe,
    }

    impl Test {
        fn new() -> Self {
            let games = Arc::new(Games::default());
            games.insert(MessageId::from(MESSAGE_ID), Game::new(user(1)));
            Test {
                runtime: Arc::default(),
                handler: PlayTicTacToe { games },
            }
        }

        async fn press(&self, user_id: UserId, button_id: &str) -> ActionResponse {
            let session = BotMessageSession {
                bot_id: user(9),
                api_gateway: user(8),
                chat: Chat::Group(user(7)),
                thread: None,
                message_id: MESSAGE_ID.into(),
                user_id,
                meta: None,
            };
            let client = Client::new(self.runtime.clone(), session.autonomous_context());
            let press = ButtonPress::new(session, button_id.to_string(), client);
            ActionHandler::<Recording>::execute(&self.handler, press).await
        }

        // The text of each edit made, in order
        fn edits(&self) -> Vec<String> {
            self.runtime
                .calls
                .lock()
                .unwrap()
                .iter()
                .map(|(method_name, args)| {
                    assert_eq!(method_name, "bot_edit_message_msgpack");
                    assert_eq!(args["message_id"], MESSAGE_ID);
                    args["content"]["MiniApp"]["text"]
                        .as_str()
                        .unwrap()
                        .to_string()
                })
                .collect()
        }
    }

    fn reply_text(response: ActionResponse) -> String {
        match response {
            ActionResponse::Success(ActionSuccess {
                message: Some(message),
            }) => match message.content {
                MessageContentInitial::Text(text) => text.text,
                other => panic!("Expected text, got {other:?}"),
            },
            other => panic!("Expected a reply, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn a_game_is_played_through_its_message() {
        let test = Test::new();

        assert!(matches!(
            test.press(user(2), "join").await,
            ActionResponse::Success(ActionSuccess { message: None })
        ));
        assert!(matches!(
            test.press(user(1), "start").await,
            ActionResponse::Success(ActionSuccess { message: None })
        ));
        for (player, cell) in [(1, 0), (2, 3), (1, 1), (2, 4), (1, 2)] {
            let response = test.press(user(player), &format!("cell-{cell}")).await;
            assert!(
                matches!(response, ActionResponse::Success(_)),
                "{response:?}"
            );
        }

        let edits = test.edits();
        assert_eq!(edits.len(), 7);
        assert!(edits[0].contains(&format!("Waiting for @UserId({}) to start", user(1))));
        assert!(edits[1].ends_with(&format!("\n@UserId({})'s turn", user(1))));
        assert!(edits[6].ends_with(&format!("\n@UserId({}) won", user(1))));

        // It's forgotten once it's over
        assert_eq!(
            reply_text(test.press(user(2), "cell-5").await),
            "This game isn't running any more"
        );
    }

    #[tokio::test]
    async fn a_move_out_of_turn_is_answered_only_to_the_player() {
        let test = Test::new();
        test.press(user(2), "join").await;
        test.press(user(1), "start").await;

        assert_eq!(
            reply_text(test.press(user(2), "cell-4").await),
            "It's not your turn"
        );
        assert_eq!(
            reply_text(test.press(user(3), "cell-4").await),
            "You're not playing in this game"
        );
        assert_eq!(test.edits().len(), 2);
    }

    #[tokio::test]
    async fn a_button_the_game_doesnt_show_is_a_bad_request() {
        let test = Test::new();

        let response = test.press(user(2), "cell-4").await;

        assert_eq!(response.status_code(), 400, "{response:?}");
        assert!(test.edits().is_empty());
    }
}
