//! Button presses on the bot's MiniApp messages.
//!
//! When a member of a chat presses a button on one of the bot's
//! [`MiniAppContent`] messages, the OpenChat website POSTs it to the bot's `/execute_action`
//! endpoint, as `{"button_id": "<id>"}`, with the user's `BotMessageSession` token in the
//! `x-oc-jwt` header. An [`ActionHandlerRegistry`] checks the token, then gives the press to an
//! [`ActionHandler`], whose [`ActionResponse`] is answered with the status the website expects:
//!
//! | response | status | body |
//! | --- | --- | --- |
//! | `Success` | 200 | JSON, `{ "message"?: { "content", "block_level_markdown" } }` |
//! | `BadRequest` | 400 | the reason, as text |
//! | `Unauthorized` | 401 | the reason, as text. The website fetches a new token and tries once more. |
//! | `TooManyRequests` | 429 | none |
//! | `InternalError` | 500 | the reason, as text |
//!
//! The bot keeps whatever state the message shows, eg. a game's, and edits the message
//! autonomously to show what changed, with [`ButtonPress::edit_message`].

use crate::oc_api::Runtime;
use crate::oc_api::client::{Client, EditMessageBuilder};
use crate::types::{
    AutonomousContext, BotMessageSession, MessageContentInitial, MiniAppContent, UserId,
};
use serde::{Deserialize, Serialize};

pub use action_handler::{ActionHandler, ActionHandlerRegistry};

mod action_handler;

/// The body of a button press
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ActionArgs {
    pub button_id: String,
}

/// A user pressing a button on one of the bot's MiniApp messages
pub struct ButtonPress<R> {
    /// Who pressed the button, and on which message, as OpenChat vouches
    pub session: BotMessageSession,
    /// The `id` of the button pressed. OpenChat doesn't check it's one of the message's buttons, nor
    /// that it was shown to the user, so the bot checks both.
    pub button_id: String,
    client: Client<R, AutonomousContext>,
}

impl<R> ButtonPress<R> {
    pub fn new(
        session: BotMessageSession,
        button_id: String,
        client: Client<R, AutonomousContext>,
    ) -> Self {
        ButtonPress {
            session,
            button_id,
            client,
        }
    }

    /// The user who pressed the button
    pub fn user_id(&self) -> UserId {
        self.session.user_id
    }

    /// A client acting autonomously in the message's chat, through the LocalUserIndex which signed
    /// the token. The bot needs the autonomous permissions for what it does there.
    pub fn client(&self) -> &Client<R, AutonomousContext> {
        &self.client
    }
}

impl<R: Runtime> ButtonPress<R> {
    /// Edits the message the button is on, eg. to show a game's new state. The bot needs the
    /// autonomous `MessagePermission::MiniApp` permission. Check the content with
    /// [`MiniAppContent::validate`] first, as OpenChat refuses content beyond its limits.
    pub fn edit_message(
        &self,
        content: MiniAppContent,
    ) -> EditMessageBuilder<'_, R, AutonomousContext> {
        self.client
            .edit_message(
                self.session.message_id,
                MessageContentInitial::MiniApp(content),
            )
            .in_thread(self.session.thread)
    }
}

/// What a bot answers a button press with. See the [module's docs](self) for each one's status.
#[derive(Clone, Debug)]
pub enum ActionResponse {
    Success(ActionSuccess),
    /// Eg. the button isn't one the user can press now
    BadRequest(String),
    /// The token is invalid or has expired
    Unauthorized(String),
    TooManyRequests,
    InternalError(String),
}

impl ActionResponse {
    /// Success, with nothing to show the user
    pub fn ok() -> Self {
        ActionResponse::Success(ActionSuccess::default())
    }

    /// Success, showing `text` to the user who pressed the button, and no one else. Like a
    /// command's ephemeral reply, it's gone once they reload the page.
    pub fn reply(text: impl Into<String>) -> Self {
        ActionResponse::Success(ActionSuccess {
            message: Some(ActionMessage {
                content: MessageContentInitial::from_text(text.into()),
                block_level_markdown: false,
            }),
        })
    }

    pub fn bad_request(reason: impl Into<String>) -> Self {
        ActionResponse::BadRequest(reason.into())
    }

    pub fn internal_error(error: impl Into<String>) -> Self {
        ActionResponse::InternalError(error.into())
    }

    pub fn status_code(&self) -> u16 {
        match self {
            ActionResponse::Success(_) => 200,
            ActionResponse::BadRequest(_) => 400,
            ActionResponse::Unauthorized(_) => 401,
            ActionResponse::TooManyRequests => 429,
            ActionResponse::InternalError(_) => 500,
        }
    }

    /// The response as the website expects it, for a runtime's HTTP glue to send
    pub fn into_http(self) -> ActionHttpResponse {
        let status_code = self.status_code();
        let (content_type, body) = match self {
            ActionResponse::Success(success) => {
                ("application/json", serde_json::to_vec(&success).unwrap())
            }
            ActionResponse::BadRequest(reason)
            | ActionResponse::Unauthorized(reason)
            | ActionResponse::InternalError(reason) => ("text/plain", reason.into_bytes()),
            ActionResponse::TooManyRequests => ("text/plain", Vec::new()),
        };

        ActionHttpResponse {
            status_code,
            content_type,
            body,
        }
    }
}

/// The body of a successful response
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ActionSuccess {
    /// Shown to the user who pressed the button, and no one else, until they reload the page
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<ActionMessage>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ActionMessage {
    /// Usually text
    pub content: MessageContentInitial,
    #[serde(default)]
    pub block_level_markdown: bool,
}

/// An [`ActionResponse`] as an HTTP response
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActionHttpResponse {
    pub status_code: u16,
    pub content_type: &'static str,
    pub body: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_response_has_the_status_and_body_the_website_expects() {
        let ok = ActionResponse::ok().into_http();
        assert_eq!(ok.status_code, 200);
        assert_eq!(ok.content_type, "application/json");
        assert_eq!(ok.body, b"{}");

        let reply = ActionResponse::reply("Not your turn").into_http();
        assert_eq!(reply.status_code, 200);
        assert_eq!(
            String::from_utf8(reply.body).unwrap(),
            r#"{"message":{"content":{"Text":{"text":"Not your turn"}},"block_level_markdown":false}}"#
        );

        let bad_request = ActionResponse::bad_request("No such button").into_http();
        assert_eq!(bad_request.status_code, 400);
        assert_eq!(bad_request.content_type, "text/plain");
        assert_eq!(bad_request.body, b"No such button");

        let unauthorized = ActionResponse::Unauthorized("Token has expired".to_string());
        assert_eq!(unauthorized.into_http().status_code, 401);

        let too_many = ActionResponse::TooManyRequests.into_http();
        assert_eq!(too_many.status_code, 429);
        assert!(too_many.body.is_empty());

        let error = ActionResponse::internal_error("Oops").into_http();
        assert_eq!(error.status_code, 500);
        assert_eq!(error.body, b"Oops");
    }
}
