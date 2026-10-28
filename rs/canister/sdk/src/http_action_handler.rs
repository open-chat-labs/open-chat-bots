use crate::{CanisterRuntime, HttpRequest, HttpResponse, env};
use oc_bots_sdk::api::action::{ActionHandlerRegistry, ActionHttpResponse, ActionResponse};
use oc_bots_sdk::types::TimestampMillis;

/// Handles a POST to `/execute_action`, a button press on one of the bot's MiniApp messages, which
/// the website sends with the user's `BotMessageSession` token in the `x-oc-jwt` header. Tokens are
/// checked against `public_key`, OpenChat's, and refused unless they're for this canister.
pub async fn execute(
    request: HttpRequest,
    action_handlers: &ActionHandlerRegistry<CanisterRuntime>,
    public_key: &str,
    now: TimestampMillis,
) -> HttpResponse {
    let response = match request.get_header("x-oc-jwt") {
        Some(jwt) => {
            action_handlers
                .execute(
                    jwt,
                    &request.body,
                    public_key,
                    env::canister_id().into(),
                    now,
                )
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
