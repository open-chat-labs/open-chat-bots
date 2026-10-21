use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::edit_message::{Args, EditMessageAction};
use crate::types::{
    ActionContext, BotChatContext, CanisterId, ChannelId, MessageContentInitial, MessageId,
    MessageIndex, OgPreview,
};
use std::sync::Arc;

pub struct EditMessageBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    channel_id: Option<ChannelId>,
    thread: Option<MessageIndex>,
    message_id: MessageId,
    content: MessageContentInitial,
    block_level_markdown: bool,
    og_previews: Option<Vec<OgPreview>>,
}

impl<'c, R: Runtime, C: ActionContext> EditMessageBuilder<'c, R, C> {
    pub fn new(
        client: &'c Client<R, C>,
        message_id: MessageId,
        content: MessageContentInitial,
    ) -> Self {
        let thread = client.context.thread();

        EditMessageBuilder {
            client,
            channel_id: None,
            thread,
            message_id,
            content,
            block_level_markdown: false,
            og_previews: None,
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

    pub fn with_block_level_markdown(mut self, block_level_markdown: bool) -> Self {
        self.block_level_markdown = block_level_markdown;
        self
    }

    /// The edited message's link previews. Unlike sending, editing doesn't look them up.
    pub fn with_og_previews(mut self, og_previews: Vec<OgPreview>) -> Self {
        self.og_previews = Some(og_previews);
        self
    }
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for EditMessageBuilder<'_, R, C> {
    type Action = EditMessageAction;

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
            content: self.content,
            block_level_markdown: self.block_level_markdown,
            og_previews: self.og_previews,
        }
    }
}
