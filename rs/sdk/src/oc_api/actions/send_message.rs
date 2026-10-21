use crate::oc_api::actions::ActionDef;
use crate::types::{
    BotChatContext, BridgedUser, EventIndex, MessageContentInitial, MessageId, MessageIndex,
    OCError, OgPreview, TimestampMillis,
};
use serde::{Deserialize, Serialize};

pub struct SendMessageAction;

impl ActionDef for SendMessageAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_send_message"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    pub thread: Option<MessageIndex>,
    pub message_id: Option<MessageId>,
    pub replies_to: Option<EventIndex>,
    pub content: MessageContentInitial,
    pub block_level_markdown: bool,
    pub finalised: bool,
    // OpenChat treats `None` and `Some(vec![])` identically (it does
    // `og_previews.unwrap_or_default()`), so this distinction is purely client-side: `None` means
    // "the runtime may look previews up", `Some(vec![])` means "don't". By the time the args
    // reach here the runtime has already acted on that, so both send no previews.
    pub og_previews: Option<Vec<OgPreview>>,
    /// Only the bridge bot for its platform can set this, on the messages it relays from there: the
    /// author's profile on that platform
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bridged_from: Option<BridgedUser>,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(SuccessResult),
    Error(OCError),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SuccessResult {
    pub message_id: MessageId,
    pub event_index: EventIndex,
    pub message_index: MessageIndex,
    pub timestamp: TimestampMillis,
    pub expires_at: Option<TimestampMillis>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::msgpack;
    use crate::types::{Chat, DiscordUser, TextContent};
    use ic_principal::Principal;
    use std::collections::BTreeMap;

    fn args(bridged_from: Option<BridgedUser>) -> Args {
        Args {
            chat_context: BotChatContext::Autonomous(Chat::Group(Principal::anonymous().into())),
            thread: None,
            message_id: None,
            replies_to: None,
            content: MessageContentInitial::Text(TextContent {
                text: "Hello".to_string(),
            }),
            block_level_markdown: false,
            finalised: true,
            og_previews: None,
            bridged_from,
        }
    }

    fn keys(args: Args) -> Vec<String> {
        let bytes = msgpack::serialize_then_unwrap(args);
        let map: BTreeMap<String, serde::de::IgnoredAny> =
            msgpack::deserialize_from_slice(&bytes).unwrap();
        map.into_keys().collect()
    }

    // Other bots' messages don't carry the field, which only a bridge bot can set
    #[test]
    fn bridged_from_is_only_sent_when_set() {
        assert!(!keys(args(None)).contains(&"bridged_from".to_string()));

        let author = BridgedUser::Discord(DiscordUser {
            id: 80351110224678912,
            username: "nelly".to_string(),
            display_name: Some("Nelly".to_string()),
            avatar: None,
        });
        assert!(keys(args(Some(author.clone()))).contains(&"bridged_from".to_string()));

        let bytes = msgpack::serialize_then_unwrap(args(Some(author.clone())));
        let decoded: Args = msgpack::deserialize_from_slice(&bytes).unwrap();
        assert_eq!(decoded.bridged_from, Some(author));
    }
}
