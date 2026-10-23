use crate::api::command::Message;
use crate::oc_api::Runtime;
use crate::oc_api::actions::send_message::*;
use crate::oc_api::actions::{ActionArgsBuilder, call_action};
use crate::types::BotChatContext;
use crate::types::EventIndex;
use crate::types::MessageIndex;
use crate::types::OgPreview;
use crate::types::{ActionContext, CallResult};
use crate::types::{BridgedUser, CanisterId, ChannelId, MessageContentInitial, MessageId};
use std::future::Future;
use std::sync::Arc;

use super::Client;

pub struct SendMessageBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    content: MessageContentInitial,
    channel_id: Option<ChannelId>,
    thread: Option<MessageIndex>,
    message_id: Option<MessageId>,
    replies_to: Option<EventIndex>,
    block_level_markdown: bool,
    finalised: bool,
    og_previews: Option<Vec<OgPreview>>,
    bridged_from: Option<BridgedUser>,
}

impl<'c, R: Runtime, C: ActionContext> SendMessageBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, content: MessageContentInitial) -> Self {
        let message_id = client.context.message_id();

        Self {
            client,
            content,
            channel_id: None,
            thread: None,
            message_id,
            replies_to: None,
            block_level_markdown: false,
            finalised: true,
            og_previews: None,
            bridged_from: None,
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

    pub fn replies_to(mut self, replies_to: Option<EventIndex>) -> Self {
        self.replies_to = replies_to;
        self
    }

    // If this is not set then OpenChat will generate a new message id. Setting it means a retried
    // send can't create a duplicate.
    pub fn with_message_id(mut self, message_id: MessageId) -> Self {
        if self.message_id.is_none() {
            self.message_id = Some(message_id);
        }
        self
    }

    pub fn with_block_level_markdown(mut self, block_level_markdown: bool) -> Self {
        self.block_level_markdown = block_level_markdown;
        self
    }

    pub fn with_finalised(mut self, finalised: bool) -> Self {
        self.finalised = finalised;
        self
    }

    /// Sets the OpenGraph link previews to attach to this message.
    ///
    /// Leaving this unset means "decide for me": offchain runtimes will look for links in the
    /// message text and fetch previews for them, in-canister runtimes will send none. Setting it
    /// (to a populated list *or* to an empty one) always wins, so passing an empty list is how
    /// you explicitly suppress previews for a single message.
    pub fn with_og_previews(mut self, og_previews: Vec<OgPreview>) -> Self {
        self.og_previews = Some(og_previews);
        self
    }

    /// Relays the message from another platform, eg. Discord, as written by `author`. Only the
    /// bridge bot for the author's platform can do this, autonomously, and only into groups and
    /// channels. OpenChat stores just the author's id on the message, and keeps their latest profile
    /// in its UserIndex.
    #[cfg(feature = "bridge")]
    pub fn with_bridged_from(mut self, author: BridgedUser) -> Self {
        self.bridged_from = Some(author);
        self
    }

    fn og_preview_text(&self) -> Option<String> {
        og_preview_text(&self.content, &self.og_previews)
    }

    pub fn execute_then_return_message<
        F: FnOnce(Args, CallResult<Response>) + Send + Sync + 'static,
    >(
        self,
        on_response: F,
    ) -> Option<Message> {
        let message = self.message();
        self.execute(on_response);
        message
    }

    /// As [`Self::execute_then_return_message`], but waits for the call rather than spawning it,
    /// eg. where the process may be stopped once the command's answered, as on AWS Lambda
    pub async fn execute_async_then_return_message(
        self,
    ) -> (Option<Message>, CallResult<Response>) {
        let message = self.message();
        (message, self.execute_async().await)
    }

    // The message to answer the command with, which OpenChat shows until its own copy arrives
    fn message(&self) -> Option<Message> {
        self.client.context.message_id().map(|message_id| Message {
            id: message_id,
            content: self.content.clone(),
            finalised: self.finalised,
            block_level_markdown: self.block_level_markdown,
            ephemeral: false,
        })
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for SendMessageBuilder<'_, R, C> {
    type Action = SendMessageAction;

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
            replies_to: self.replies_to,
            content: self.content,
            block_level_markdown: self.block_level_markdown,
            finalised: self.finalised,
            og_previews: self.og_previews,
            bridged_from: self.bridged_from,
        }
    }

    // `execute` and `execute_async` are overridden so that the preview lookup happens on the way
    // to the wire rather than at message construction time. That way it is done in exactly one
    // place, messages built by hand are covered too, and nothing that never gets sent pays for it.
    fn execute<F: FnOnce(Args, CallResult<Response>) + Send + Sync + 'static>(
        self,
        on_response: F,
    ) {
        let runtime = self.runtime();
        let runtime_clone = runtime.clone();
        let api_gateway = self.api_gateway();
        let preview_text = self.og_preview_text();
        let mut args = self.into_args();

        runtime.spawn(async move {
            add_og_previews(&*runtime_clone, &mut args.og_previews, preview_text).await;

            let response =
                call_action::<SendMessageAction, R>(&*runtime_clone, api_gateway, args.clone())
                    .await;

            on_response(args, response);
        });
    }

    fn execute_async(self) -> impl Future<Output = CallResult<Response>> + Send {
        let runtime = self.runtime();
        let api_gateway = self.api_gateway();
        let preview_text = self.og_preview_text();
        let mut args = self.into_args();

        async move {
            add_og_previews(&*runtime, &mut args.og_previews, preview_text).await;
            call_action::<SendMessageAction, R>(&*runtime, api_gateway, args).await
        }
    }
}

// The message text we should look for links in, or None if there is nothing to look up
// either because previews were set explicitly or because this isn't a text message.
pub(super) fn og_preview_text(
    content: &MessageContentInitial,
    og_previews: &Option<Vec<OgPreview>>,
) -> Option<String> {
    if og_previews.is_some() {
        return None;
    }
    match content {
        MessageContentInitial::Text(text) if !text.text.is_empty() => Some(text.text.clone()),
        _ => None,
    }
}

// Note we leave `og_previews` as `None` if we found nothing, rather than setting it to an empty
// list - on the wire they mean the same thing but `None` is the smaller payload.
pub(super) async fn add_og_previews<R: Runtime>(
    runtime: &R,
    og_previews: &mut Option<Vec<OgPreview>>,
    preview_text: Option<String>,
) {
    let Some(text) = preview_text else {
        return;
    };
    let previews = runtime.fetch_og_previews(text).await;
    if !previews.is_empty() {
        *og_previews = Some(previews);
    }
}
