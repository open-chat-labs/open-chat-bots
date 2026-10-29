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
    /// For a MiniApp card, a token which registers its game with OpenChat's MiniApp service, valid
    /// for an hour, eg. with the offchain SDK's `MiniAppServiceClient::register`
    pub mini_app_registration: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::msgpack;

    // As OpenChat's LocalUserIndex encodes it
    #[derive(Serialize)]
    enum OpenChatResponse {
        Success {
            message_id: MessageId,
            event_index: EventIndex,
            message_index: MessageIndex,
            timestamp: TimestampMillis,
            expires_at: Option<TimestampMillis>,
            mini_app_registration: Option<String>,
        },
    }

    #[test]
    fn a_sent_mini_app_comes_back_with_its_registration() {
        let bytes = msgpack::serialize_then_unwrap(OpenChatResponse::Success {
            message_id: 5.into(),
            event_index: 1,
            message_index: 2,
            timestamp: 3,
            expires_at: None,
            mini_app_registration: Some("token".to_string()),
        });
        let response: Response = msgpack::deserialize_then_unwrap(&bytes);

        assert!(matches!(
            response,
            Response::Success(r) if r.mini_app_registration.as_deref() == Some("token")
        ));
    }
}
