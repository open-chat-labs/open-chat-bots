use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::update_mini_app::{Args, UpdateMiniAppAction};
use crate::types::{
    ActionContext, BotChatContext, CanisterId, ChannelId, MessageId, MessageIndex, MiniAppUpdate,
};
use std::sync::Arc;

pub struct UpdateMiniAppBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    thread: Option<MessageIndex>,
    message_id: MessageId,
    update: MiniAppUpdate,
}

impl<'c, R: Runtime, C: ActionContext> UpdateMiniAppBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, message_id: MessageId, update: MiniAppUpdate) -> Self {
        let thread = client.context.thread();

        UpdateMiniAppBuilder {
            client,
            channel_id: None,
            thread,
            message_id,
            update,
        }
    }

    // This only takes effect for community scope
    pub fn in_channel(mut self, channel_id: Option<ChannelId>) -> Self {
        self.channel_id = channel_id;
        self
    }

    /// The thread the card is in, eg. a `BotMessageSession`'s `thread`
    pub fn in_thread(mut self, thread: Option<MessageIndex>) -> Self {
        self.thread = thread;
        self
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for UpdateMiniAppBuilder<'_, R, C> {
    type Action = UpdateMiniAppAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        Args {
            chat_context: BotChatContext::from_action_context(
                &self.client.context,
                self.channel_id,
            )
            .unwrap(),
            thread: self.thread,
            message_id: self.message_id,
            update: self.update,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::oc_api::actions::ActionDef;
    use crate::types::{
        ActionScope, AutonomousContext, CallResult, Chat, MiniAppStatus, TimestampMillis, UserId,
    };
    use ic_principal::Principal;
    use serde::{Deserialize, Serialize};
    use std::future::Future;

    // Only builds args, so never calls
    struct NoCalls;

    impl Runtime for NoCalls {
        #[allow(clippy::manual_async_fn)]
        fn call_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
            &self,
            _: CanisterId,
            _: &str,
            _: A,
        ) -> impl Future<Output = CallResult<R>> + Send {
            async { unimplemented!() }
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

    #[test]
    fn updates_the_card_in_its_chat_and_thread() {
        let channel = Chat::Channel(id(1), 7);
        let client = Client::new(
            Arc::new(NoCalls),
            AutonomousContext {
                api_gateway: id(2),
                scope: ActionScope::Chat(channel),
            },
        );
        let update = MiniAppUpdate::default()
            .with_players(vec![id(3)])
            .with_status(MiniAppStatus::Active);

        let builder = client
            .update_mini_app(MessageId::from(5), update.clone())
            .in_thread(Some(9));
        assert_eq!(builder.api_gateway(), id(2));
        let args = builder.into_args();

        assert!(matches!(args.chat_context, BotChatContext::Autonomous(c) if c == channel));
        assert_eq!(args.thread, Some(9));
        assert_eq!(args.message_id, MessageId::from(5));
        assert_eq!(args.update, update);
        assert_eq!(
            UpdateMiniAppAction::method_name(false),
            "bot_update_mini_app"
        );
    }

    #[test]
    fn a_card_not_in_a_thread_has_none() {
        let client = Client::new(
            Arc::new(NoCalls),
            AutonomousContext {
                api_gateway: id(2),
                scope: ActionScope::Chat(Chat::Group(id(1))),
            },
        );

        let args = client
            .update_mini_app(MessageId::from(5), MiniAppUpdate::default())
            .into_args();

        assert_eq!(args.thread, None);
    }
}
