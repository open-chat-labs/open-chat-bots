use crate::AppState;
use crate::api::ApiError;
use axum::extract::{Extension, Json, State};
use axum::http::StatusCode;
use oc_bots_sdk::types::{MiniAppPlayerClaims, TokenError};
use oc_bots_sdk_offchain::env;
use oc_bots_sdk_offchain::middleware::tower::OpenChatJwt;
use oc_bots_sdk_offchain::mini_app::{JoinResponse, MiniAppVerifier, StartResponse};
use std::sync::Arc;

// The MiniApp service's calls to the bot, each with the service's token in `x-oc-jwt`, which says
// who the user is and which game it's about. Each is answered within 5 seconds, with a 200.

/// POST /mini_app/join: the first two are welcome
pub async fn join(
    State(state): State<Arc<AppState>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
) -> Result<Json<JoinResponse>, ApiError> {
    let claims = verified(&state, |verifier| verifier.join(&jwt)).await?;

    Ok(Json(
        match state.bot.games.join(claims.game, claims.user_id) {
            Ok(()) => {
                state.bot.publish_lobby(claims.game);
                JoinResponse::accept()
            }
            Err(message) => JoinResponse::refuse(message),
        },
    ))
}

/// POST /mini_app/start: the game starts between the two who've joined, with a coin deciding who's
/// White, and it's White's move
pub async fn start(
    State(state): State<Arc<AppState>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
) -> Result<Json<StartResponse>, ApiError> {
    let claims = verified(&state, |verifier| verifier.start(&jwt)).await?;

    Ok(Json(
        match state
            .bot
            .games
            .start(claims.game, claims.user_id, env::now(), rand::random())
        {
            Ok((players, change)) => {
                // The service passes this first state on itself, so only White's flag is watched
                if let Some(deadline) = change.deadline {
                    state.bot.arm_clock(claims.game, deadline);
                }
                StartResponse::accept(players, change.waiting_for, change.state)
            }
            Err(message) => StartResponse::refuse(message),
        },
    ))
}

/// POST /mini_app/leave: 200 whether or not they were in the game
pub async fn leave(
    State(state): State<Arc<AppState>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
) -> Result<StatusCode, ApiError> {
    let claims = verified(&state, |verifier| verifier.leave(&jwt)).await?;
    state.bot.games.leave(claims.game, claims.user_id);
    state.bot.publish_lobby(claims.game);

    Ok(StatusCode::OK)
}

// The token's claims, if the service signed it for this bot and this call, and it hasn't expired
pub async fn verified(
    state: &AppState,
    verify: impl FnOnce(&MiniAppVerifier) -> Result<MiniAppPlayerClaims, TokenError>,
) -> Result<MiniAppPlayerClaims, ApiError> {
    let verifier = state
        .bot
        .verifier()
        .await
        .map_err(|error| ApiError(StatusCode::INTERNAL_SERVER_ERROR, error))?;

    verify(verifier).map_err(|error| ApiError(StatusCode::UNAUTHORIZED, error.to_string()))
}
