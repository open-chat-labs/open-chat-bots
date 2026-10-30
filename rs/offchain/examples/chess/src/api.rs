use crate::AppState;
use crate::games::Change;
use crate::service::verified;
use axum::extract::rejection::JsonRejection;
use axum::extract::{Extension, Json, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use oc_bots_sdk::types::MiniAppGame;
use oc_bots_sdk_offchain::env;
use oc_bots_sdk_offchain::middleware::tower::OpenChatJwt;
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;

// The calls the bot's app makes for a player, each with their player token in `x-oc-jwt`. Each
// answers `{ "ok": true }`, or `{ "error": ".." }`. Spectators never call the bot: the service
// passes them the shared state.

#[derive(Deserialize)]
pub struct MoveArgs {
    /// The move as UCI: the squares it's from and to, eg. "e2e4", "e1g1" to castle, with the piece
    /// to promote to on the end, eg. "e7e8q"
    #[serde(rename = "move")]
    uci: String,
}

/// POST /api/move: plays the move, and sends everyone with the game open the new position
pub async fn play_move(
    State(state): State<Arc<AppState>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
    // Taken as a result so that the token is checked before the body: a 401 comes first
    body: Result<Json<MoveArgs>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let claims = verified(&state, |verifier| verifier.player(&jwt)).await?;
    let Json(args) =
        body.map_err(|rejection| ApiError(StatusCode::BAD_REQUEST, rejection.body_text()))?;
    let now = env::now();

    // If a flag has fallen, the game's over, whatever the move
    if let Some(change) = state.bot.games.flag(claims.game, now) {
        publish(&state, claims.game, change).await?;
    }
    let change = state
        .bot
        .games
        .play_move(claims.game, claims.user_id, &args.uci, now)
        .map_err(|reason| ApiError(StatusCode::CONFLICT, reason))?;
    publish(&state, claims.game, change).await?;

    Ok(Json(json!({ "ok": true })))
}

/// POST /api/resign: the other player wins
pub async fn resign(
    State(state): State<Arc<AppState>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
) -> Result<Json<Value>, ApiError> {
    let claims = verified(&state, |verifier| verifier.player(&jwt)).await?;
    let change = state
        .bot
        .games
        .resign(claims.game, claims.user_id, env::now())
        .map_err(|reason| ApiError(StatusCode::CONFLICT, reason))?;
    publish(&state, claims.game, change).await?;

    Ok(Json(json!({ "ok": true })))
}

/// POST /api/draw: offers the other player a draw, or accepts theirs if it stands, which ends the
/// game
pub async fn draw(
    State(state): State<Arc<AppState>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
) -> Result<Json<Value>, ApiError> {
    let claims = verified(&state, |verifier| verifier.player(&jwt)).await?;
    let change = state
        .bot
        .games
        .offer_draw(claims.game, claims.user_id, env::now())
        .map_err(|reason| ApiError(StatusCode::CONFLICT, reason))?;
    publish(&state, claims.game, change).await?;

    Ok(Json(json!({ "ok": true })))
}

async fn publish(state: &AppState, game: MiniAppGame, change: Change) -> Result<(), ApiError> {
    state
        .bot
        .publish(game, change)
        .await
        .map_err(|error| ApiError(StatusCode::BAD_GATEWAY, error))
}

pub struct ApiError(pub StatusCode, pub String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}
