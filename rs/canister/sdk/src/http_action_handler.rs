use crate::{CanisterRuntime, HttpRequest, HttpResponse};
use oc_bots_sdk::api::action::{ActionHandlerRegistry, ActionHttpResponse, ActionResponse};
use oc_bots_sdk::types::{TimestampMillis, UserId};

/// Handles a POST to `/execute_action`, a button press on one of the bot's MiniApp messages, which
/// the website sends with the user's `BotMessageSession` token in the `x-oc-jwt` header. Tokens are
/// checked against `public_key`, OpenChat's, and refused unless they're for `bot_id`.
///
/// `bot_id` is the user id OpenChat gave the bot when it was registered, not the canister's id. A
/// canister bot learns it from the `BotLifecycleEvent::Registered` notification, or from the
/// callback of [`installation_events::load`](crate::installation_events::load), as the
/// ModeratorBot does, and keeps it in its state.
pub async fn execute(
    request: HttpRequest,
    action_handlers: &ActionHandlerRegistry<CanisterRuntime>,
    public_key: &str,
    bot_id: UserId,
    now: TimestampMillis,
) -> HttpResponse {
    let response = match request.get_header("x-oc-jwt") {
        Some(jwt) => {
            action_handlers
                .execute(jwt, &request.body, public_key, bot_id, now)
                .await
        }
        // Refused as an invalid token is, as offchain bots' `ExtractJwtLayer` does
        None => ActionResponse::Unauthorized("No token found".to_string()),
    };

    let ActionHttpResponse {
        status_code,
        content_type,
        body,
    } = response.into_http();

    // With a content type and CORS headers, even without a body, so that the website can read it
    HttpResponse::new(status_code, body, content_type)
}
