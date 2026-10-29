use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::mini_app_post_token::{Args, MiniAppPostTokenAction};
use crate::types::{ActionContext, BotChatContext, CanisterId, ChannelId, MessageId, MessageIndex};
use std::sync::Arc;

pub struct MiniAppPostTokenBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    thread: Option<MessageIndex>,
    message_id: Option<MessageId>,
}

impl<'c, R: Runtime, C: ActionContext> MiniAppPostTokenBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>) -> Self {
        Self {
            client,
            channel_id: None,
            thread: None,
            message_id: None,
        }
    }

    // This only takes effect for community scope
    pub fn in_channel(mut self, channel_id: Option<ChannelId>) -> Self {
        self.channel_id = channel_id;
        self
    }

    pub fn in_thread(mut self, thread: Option<MessageIndex>) -> Self {
        self.thread = thread;
        self
    }

    /// The card's message id. A chat command's card is the command's message, so one given here
    /// must match the command's, which the LocalUserIndex checks. Otherwise the bot chooses it, as
    /// the LocalUserIndex can't draw a fresh one in a query: this one, or else a random one, except
    /// in a canister, which has no random source here, so it chooses its own, or gets the
    /// LocalUserIndex's error. The token fixes the id, so keep it, and retry a post with it rather
    /// than asking for another token, whose id would differ.
    pub fn with_message_id(mut self, message_id: MessageId) -> Self {
        self.message_id = Some(message_id);
        self
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for MiniAppPostTokenBuilder<'_, R, C> {
    type Action = MiniAppPostTokenAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        // A chat command's token fixes its card's message id. Otherwise the bot chooses it, as the
        // LocalUserIndex can't draw a fresh one in a query: its randomness repeats within a round.
        let message_id = match (self.message_id, self.client.context.message_id()) {
            (Some(message_id), _) => Some(message_id),
            (None, Some(_)) => None,
            (None, None) => random_message_id(),
        };

        Args {
            chat_context: BotChatContext::from_action_context(
                &self.client.context,
                self.channel_id,
            )
            .unwrap(),
            channel_id: self.channel_id,
            thread: self.thread,
            message_id,
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn random_message_id() -> Option<MessageId> {
    Some(rand::random::<u64>().into())
}

// A canister registers no source for `rand`, so it can't draw one: the bot chooses its own, or the
// LocalUserIndex says it must
#[cfg(target_arch = "wasm32")]
fn random_message_id() -> Option<MessageId> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::command::Command;
    use crate::msgpack;
    use crate::oc_api::actions::mini_app_post_token::Response;
    use crate::types::{
        ActionScope, AutonomousContext, BotActionChatDetails, BotActionCommunityDetails,
        BotCommandContext, BotCommandScope, BotPermissions, CallResult, Chat, TimestampMillis,
        UserId,
    };
    use futures_util::FutureExt;
    use ic_principal::Principal;
    use serde::{Deserialize, Serialize};
    use std::future::Future;
    use std::sync::Mutex;

    // The canister, the method, the args in msgpack, and whether it was called as a query
    type Call = (CanisterId, String, Vec<u8>, bool);

    // Answers every call with a token, and records them
    #[derive(Default)]
    struct FakeRuntime {
        calls: Mutex<Vec<Call>>,
    }

    impl FakeRuntime {
        fn call<A: Serialize, R: for<'a> Deserialize<'a>>(
            &self,
            canister_id: CanisterId,
            method_name: &str,
            args: A,
            is_query: bool,
        ) -> CallResult<R> {
            self.calls.lock().unwrap().push((
                canister_id,
                method_name.to_string(),
                msgpack::serialize_then_unwrap(args),
                is_query,
            ));
            let bytes = msgpack::serialize_then_unwrap(Response::Success("token".to_string()));
            Ok(msgpack::deserialize_then_unwrap(&bytes))
        }

        // The one call made, as the LocalUserIndex reads it
        fn args(&self, local_user_index: CanisterId) -> Args {
            let calls = self.calls.lock().unwrap();
            let [(canister_id, method_name, args, is_query)] = calls.as_slice() else {
                panic!("{calls:?}");
            };
            assert_eq!(*canister_id, local_user_index);
            assert_eq!(method_name, "bot_mini_app_post_token_msgpack");
            assert!(is_query);
            msgpack::deserialize_then_unwrap(args)
        }
    }

    impl Runtime for FakeRuntime {
        async fn call_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
            &self,
            canister_id: CanisterId,
            method_name: &str,
            args: A,
        ) -> CallResult<R> {
            self.call(canister_id, method_name, args, false)
        }

        async fn query_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
            &self,
            canister_id: CanisterId,
            method_name: &str,
            args: A,
        ) -> CallResult<R> {
            self.call(canister_id, method_name, args, true)
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

    fn id(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    fn local_user_index() -> CanisterId {
        id(1)
    }

    fn command_context(scope: BotCommandScope) -> BotCommandContext {
        BotCommandContext {
            jwt: "jwt".to_string(),
            bot_id: id(2),
            api_gateway: local_user_index(),
            command: Command {
                name: "uno".to_string(),
                args: Vec::new(),
                initiator: id(4),
                meta: None,
            },
            scope,
            granted_permissions: BotPermissions::text_only(),
        }
    }

    // The command's token says which chat and message, as for `send_message`, so no message id is
    // sent unless the bot gives one, which the LocalUserIndex checks against the command's
    #[test]
    fn a_chat_command_asks_its_local_user_index_with_its_token() {
        for given in [None, Some(9.into())] {
            let runtime = Arc::new(FakeRuntime::default());
            let context = command_context(BotCommandScope::Chat(BotActionChatDetails {
                chat: Chat::Group(id(3)),
                thread: Some(6),
                message_id: 5.into(),
                user_message_id: None,
            }));
            let client = Client::new(runtime.clone(), context);

            let mut builder = client.mini_app_post_token().in_thread(Some(6));
            if let Some(message_id) = given {
                builder = builder.with_message_id(message_id);
            }
            let response = builder.execute_async().now_or_never().unwrap();

            assert!(matches!(response, Ok(Response::Success(t)) if t == "token"));
            let args = runtime.args(local_user_index());
            assert!(matches!(&args.chat_context, BotChatContext::Command(jwt) if jwt == "jwt"));
            assert_eq!(args.channel_id, None);
            assert_eq!(args.thread, Some(6));
            assert_eq!(args.message_id, given);
        }
    }

    #[test]
    fn a_community_command_names_its_channel() {
        let runtime = Arc::new(FakeRuntime::default());
        let context = command_context(BotCommandScope::Community(BotActionCommunityDetails {
            community_id: id(3),
        }));
        let client = Client::new(runtime.clone(), context);

        client
            .mini_app_post_token()
            .in_channel(Some(7))
            .execute_async()
            .now_or_never()
            .unwrap()
            .unwrap();

        let args = runtime.args(local_user_index());
        assert!(matches!(&args.chat_context, BotChatContext::Command(jwt) if jwt == "jwt"));
        assert_eq!(args.channel_id, Some(7));
        // The command's token has no message id, so the builder draws one, as for an autonomous post
        assert!(args.message_id.is_some());
    }

    // Autonomously the bot names the chat, and chooses the message id, or else the builder draws
    // one, as the LocalUserIndex can't in a query
    #[test]
    fn an_autonomous_post_names_its_chat_and_always_has_a_message_id() {
        let post = |message_id: Option<MessageId>| {
            let runtime = Arc::new(FakeRuntime::default());
            let context = AutonomousContext {
                api_gateway: local_user_index(),
                scope: ActionScope::Community(id(3)),
            };
            let client = Client::new(runtime.clone(), context);

            let mut builder = client.mini_app_post_token().in_channel(Some(7));
            if let Some(message_id) = message_id {
                builder = builder.with_message_id(message_id);
            }
            builder.execute_async().now_or_never().unwrap().unwrap();

            runtime.args(local_user_index())
        };

        let chosen = post(Some(9.into()));
        assert!(matches!(
            chosen.chat_context,
            BotChatContext::Autonomous(Chat::Channel(community, 7)) if community == id(3)
        ));
        assert_eq!(chosen.channel_id, Some(7));
        assert_eq!(chosen.thread, None);
        assert_eq!(chosen.message_id, Some(9.into()));

        let drawn = post(None).message_id.unwrap();
        assert_ne!(drawn, post(None).message_id.unwrap());
    }
}
