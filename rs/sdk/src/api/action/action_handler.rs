use crate::api::action::{ActionArgs, ActionResponse, ButtonPress};
use crate::oc_api::Runtime;
use crate::oc_api::client::ClientFactory;
use crate::types::{BotMessageSession, MiniAppContent, TimestampMillis, UserId};
use async_trait::async_trait;
use std::sync::Arc;

/// Gives each button press on the bot's MiniApp messages to the first handler registered which
/// [handles](ActionHandler::handles) the button, once the user's token is verified
pub struct ActionHandlerRegistry<R> {
    handlers: Vec<Box<dyn ActionHandler<R>>>,
    oc_client_factory: Arc<ClientFactory<R>>,
}

impl<R: Runtime> ActionHandlerRegistry<R> {
    pub fn new(oc_client_factory: Arc<ClientFactory<R>>) -> ActionHandlerRegistry<R> {
        Self {
            handlers: Vec::new(),
            oc_client_factory,
        }
    }

    pub fn register<H: ActionHandler<R> + 'static>(mut self, handler: H) -> Self {
        self.handlers.push(Box::new(handler));
        self
    }

    /// Handles a POST to `/execute_action`: `jwt` is the `x-oc-jwt` header, `body` the request's
    /// body, `public_key` OpenChat's, and `bot_id` this bot's own id, as tokens for other bots are
    /// refused
    pub async fn execute(
        &self,
        jwt: &str,
        body: &[u8],
        public_key: &str,
        bot_id: UserId,
        now: TimestampMillis,
    ) -> ActionResponse {
        let session = match BotMessageSession::parse(jwt, public_key, bot_id, now) {
            Ok(session) => session,
            Err(error) => return ActionResponse::Unauthorized(error.to_string()),
        };

        let args: ActionArgs = match serde_json::from_slice(body) {
            Ok(args) => args,
            Err(error) => return ActionResponse::bad_request(format!("Args invalid: {error}")),
        };

        if args.button_id.is_empty() || args.button_id.len() > MiniAppContent::MAX_ID_BYTES {
            return ActionResponse::bad_request("Button id invalid");
        }

        let Some(handler) = self.handlers.iter().find(|h| h.handles(&args.button_id)) else {
            return ActionResponse::bad_request(format!("Unknown button: {}", args.button_id));
        };

        let client = self.oc_client_factory.build(session.autonomous_context());
        handler
            .execute(ButtonPress::new(session, args.button_id, client))
            .await
    }
}

#[async_trait]
pub trait ActionHandler<R>: Send + Sync {
    /// Whether this handler answers presses of the button with this id, eg. by a prefix its
    /// buttons share. By default it answers them all.
    fn handles(&self, _button_id: &str) -> bool {
        true
    }

    /// Acts on the press, eg. moving a piece in a game and editing the message to show it. A press
    /// of a button the user can't press now is answered with a [`ActionResponse::reply`] saying why,
    /// or a [`ActionResponse::BadRequest`].
    async fn execute(&self, press: ButtonPress<R>) -> ActionResponse;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jwt::test_tokens::{public_key_pem, sign, signing_key};
    use crate::msgpack;
    use crate::oc_api::actions::ActionArgsBuilder;
    use crate::types::{
        ActionScope, CallResult, CanisterId, Chat, MessageButton, MessageButtonStyle,
        MessageContentInitial, UnitResult,
    };
    use ic_principal::Principal;
    use serde::{Deserialize, Serialize};
    use std::future::Future;
    use std::sync::Mutex;

    const NOW: TimestampMillis = 1_800_000_000_000;

    // Records each call, as JSON, and answers it with success
    #[derive(Default)]
    struct Recording {
        calls: Mutex<Vec<(CanisterId, String, serde_json::Value)>>,
    }

    impl Runtime for Recording {
        async fn call_canister<A: Serialize + Send, T: for<'a> Deserialize<'a>>(
            &self,
            canister_id: CanisterId,
            method_name: &str,
            args: A,
        ) -> CallResult<T> {
            self.calls.lock().unwrap().push((
                canister_id,
                method_name.to_string(),
                serde_json::to_value(args).unwrap(),
            ));
            Ok(msgpack::deserialize_then_unwrap(
                &msgpack::serialize_then_unwrap(UnitResult::Success),
            ))
        }

        fn spawn<F: Future<Output = ()> + Send + 'static>(&self, _: F) {
            unimplemented!()
        }

        fn now(&self) -> TimestampMillis {
            NOW
        }

        fn is_canister(&self) -> bool {
            false
        }
    }

    // Records each press it's given
    #[derive(Default)]
    struct Recorder {
        prefix: &'static str,
        presses: Arc<Mutex<Vec<(UserId, ActionScope, String)>>>,
    }

    #[async_trait]
    impl<R: Runtime> ActionHandler<R> for Recorder {
        fn handles(&self, button_id: &str) -> bool {
            button_id.starts_with(self.prefix)
        }

        async fn execute(&self, press: ButtonPress<R>) -> ActionResponse {
            self.presses.lock().unwrap().push((
                press.user_id(),
                press.client().context().scope,
                press.button_id.clone(),
            ));
            ActionResponse::reply(format!("{} pressed", press.button_id))
        }
    }

    fn id(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    fn token(bot: UserId, exp_seconds: u64) -> String {
        sign(
            &signing_key(),
            &format!(
                r#"{{"exp":{exp_seconds},"claim_type":"BotMessageSession","bot_api_gateway":"{}","bot":"{bot}","chat":{{"Group":"{}"}},"thread":null,"message_id":"5","user_id":"{}","meta":null}}"#,
                id(1),
                id(3),
                id(4),
            ),
        )
    }

    fn valid_token() -> String {
        token(id(2), NOW / 1000 + 3600)
    }

    fn registry(handlers: Vec<Recorder>) -> ActionHandlerRegistry<Recording> {
        handlers.into_iter().fold(
            ActionHandlerRegistry::new(Arc::new(ClientFactory::new(Recording::default()))),
            |registry, handler| registry.register(handler),
        )
    }

    fn execute(
        registry: &ActionHandlerRegistry<Recording>,
        jwt: &str,
        body: &str,
    ) -> ActionResponse {
        block_on(registry.execute(jwt, body.as_bytes(), &public_key_pem(), id(2), NOW))
    }

    // Nothing here waits, so each future is ready when first polled
    fn block_on<F: Future>(future: F) -> F::Output {
        futures_util::FutureExt::now_or_never(future).expect("The future should be ready")
    }

    #[test]
    fn a_press_goes_to_the_first_handler_of_its_button() {
        let game = Recorder {
            prefix: "cell-",
            ..Default::default()
        };
        let fallback = Recorder::default();
        let (game_presses, fallback_presses) = (game.presses.clone(), fallback.presses.clone());
        let registry = registry(vec![game, fallback]);

        let response = execute(&registry, &valid_token(), r#"{"button_id":"cell-4"}"#);
        execute(&registry, &valid_token(), r#"{"button_id":"join"}"#);

        let ActionResponse::Success(success) = response else {
            panic!("Expected success, got {response:?}");
        };
        assert!(matches!(
            success.message.unwrap().content,
            MessageContentInitial::Text(t) if t.text == "cell-4 pressed"
        ));
        let chat = ActionScope::Chat(Chat::Group(id(3)));
        assert_eq!(
            *game_presses.lock().unwrap(),
            [(id(4), chat, "cell-4".to_string())]
        );
        assert_eq!(
            *fallback_presses.lock().unwrap(),
            [(id(4), chat, "join".to_string())]
        );
    }

    #[test]
    fn a_bad_token_is_unauthorized() {
        let registry = registry(vec![Recorder::default()]);
        let expired = token(id(2), NOW / 1000);
        let for_another_bot = token(id(9), NOW / 1000 + 3600);

        for jwt in ["", &expired, &for_another_bot] {
            // Even with a bad body, as the token's checked first
            for body in [r#"{"button_id":"join"}"#, ""] {
                let response = execute(&registry, jwt, body);
                assert_eq!(response.status_code(), 401, "{response:?}");
            }
        }
    }

    #[test]
    fn a_bad_body_or_button_is_a_bad_request() {
        let registry = registry(vec![Recorder {
            prefix: "cell-",
            ..Default::default()
        }]);
        let too_long = format!(r#"{{"button_id":"cell-{}"}}"#, "1".repeat(60));

        for body in [
            "",
            "{}",
            r#"{"button":"cell-4"}"#,
            r#"{"button_id":""}"#,
            &too_long,
            r#"{"button_id":"join"}"#,
        ] {
            let response = execute(&registry, &valid_token(), body);
            assert_eq!(response.status_code(), 400, "{body}: {response:?}");
        }
    }

    #[test]
    fn a_press_edits_its_message_autonomously_in_its_thread() {
        let runtime = Arc::new(Recording::default());
        let session = BotMessageSession {
            bot_id: id(2),
            api_gateway: id(1),
            chat: Chat::Channel(id(3), 7),
            thread: Some(12),
            message_id: u64::MAX.into(),
            user_id: id(4),
            meta: None,
        };
        let client =
            crate::oc_api::client::Client::new(runtime.clone(), session.autonomous_context());
        let press = ButtonPress::new(session, "cell-4".to_string(), client);
        let content = MiniAppContent {
            text: "X to play".to_string(),
            button_rows: vec![vec![MessageButton {
                id: "cell-4".to_string(),
                label: "X".to_string(),
                style: MessageButtonStyle::Secondary,
                visible_to: None,
            }]],
        };

        let response = block_on(press.edit_message(content).execute_async());

        assert!(matches!(response, Ok(UnitResult::Success)));
        let calls = runtime.calls.lock().unwrap();
        let [(api_gateway, method_name, args)] = &calls[..] else {
            panic!("Expected one call, got {calls:?}");
        };
        assert_eq!(*api_gateway, id(1));
        assert_eq!(method_name, "bot_edit_message_msgpack");
        assert_eq!(
            args["chat_context"],
            serde_json::json!({ "Autonomous": { "Channel": [id(3).to_string(), 7] } })
        );
        assert_eq!(args["thread"], 12);
        assert_eq!(args["message_id"], u64::MAX.to_string());
        assert_eq!(args["content"]["MiniApp"]["text"], "X to play");
        assert_eq!(
            args["content"]["MiniApp"]["button_rows"][0][0]["id"],
            "cell-4"
        );
    }
}
