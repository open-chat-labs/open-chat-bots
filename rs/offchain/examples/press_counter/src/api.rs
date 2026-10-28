use crate::AppState;
use crate::presses::PressesView;
use axum::extract::{Extension, Json, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use oc_bots_sdk::types::{BotMessageSession, TokenError};
use oc_bots_sdk_offchain::env;
use oc_bots_sdk_offchain::middleware::tower::OpenChatJwt;
use serde_json::json;
use std::sync::Arc;

// The calls the bot's app makes, each with the user's BotMessageSession token in the `x-oc-jwt`
// header. Each answers with the card's counts as the user sees them, or `{"error": ".."}`.

/// GET /api/presses
pub async fn presses(
    State(state): State<Arc<AppState>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
) -> Result<Json<PressesView>, ApiError> {
    let session = verify(&state, &jwt).await?;

    Ok(Json(state.presses.get(
        session.card(),
        session.api_gateway,
        session.user_id,
        env::now(),
    )))
}

/// POST /api/press. A user's first press makes them a player, which the bot shows on the card.
pub async fn press(
    State(state): State<Arc<AppState>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
) -> Result<Json<PressesView>, ApiError> {
    let session = verify(&state, &jwt).await?;

    Ok(Json(state.presses.press(
        session.card(),
        session.api_gateway,
        session.user_id,
        env::now(),
    )))
}

// Checks the token is OpenChat's, that it's a BotMessageSession token, for this bot, and that it
// hasn't expired. The app answers a 401 by asking OpenChat for a new token, then trying once more.
async fn verify(state: &AppState, jwt: &str) -> Result<BotMessageSession, ApiError> {
    let bot_id = state
        .bot_id()
        .await
        .map_err(|error| ApiError(StatusCode::INTERNAL_SERVER_ERROR, error))?;

    BotMessageSession::parse(jwt, &state.oc_public_key, bot_id, env::now()).map_err(|error| {
        let reason = match error {
            TokenError::Expired => "The token has expired".to_string(),
            TokenError::Invalid(reason) => reason,
        };
        ApiError(StatusCode::UNAUTHORIZED, reason)
    })
}

pub struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}
