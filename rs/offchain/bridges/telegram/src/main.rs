//! Bridges Telegram groups with OpenChat groups and public channels, both ways. See the README.

use crate::api::{TelegramApi, Update};
use crate::avatars::Avatars;
use crate::config::Config;
use crate::platform::Telegram;
use crate::updates::UpdateHandler;
use anyhow::{Context, Result, anyhow};
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use axum::{Json, Router};
use oc_bots_sdk::types::BridgePlatform;
use oc_bridge_core::{Bridge, BridgeStore, OpenChat, PermanentFailure, http};
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tracing::{info, warn};

mod api;
mod avatars;
mod config;
mod platform;
mod updates;

#[tokio::main]
async fn main() -> Result<()> {
    let on_lambda = std::env::var("AWS_LAMBDA_RUNTIME_API").is_ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        // CloudWatch shows colour codes as text
        .with_ansi(!on_lambda)
        .init();

    let config = Config::from_env()?;
    let api = Arc::new(TelegramApi::new(config.telegram_token.clone()));
    if std::env::args().nth(1).as_deref() == Some("setup") {
        return setup(&api, &config).await;
    }

    let username = match config.bot_username {
        Some(username) => username,
        None => api
            .get_me()
            .await?
            .username
            .context("The bot has no username")?,
    };
    let store = BridgeStore::from_env(BridgePlatform::Telegram).await;
    let openchat = OpenChat::new(config.openchat).await?;
    info!(principal = %openchat.principal(), username, "OpenChat bot");

    let avatars = match config.avatars_bucket {
        Some(bucket) => Some(Avatars::new(store.clone(), api.clone(), bucket).await),
        None => {
            warn!("TELEGRAM_AVATARS_BUCKET isn't set, so users' photos aren't relayed");
            None
        }
    };
    let platform = Telegram {
        api: api.clone(),
        username: username.clone(),
        avatars,
    };
    let bridge = Arc::new(Bridge::new(openchat, store, platform));
    // Kept alive until the process exits, as the OpenChat runtime can't be dropped from within
    // async code
    std::mem::forget(bridge.clone());

    let handler = UpdateHandler {
        bridge: bridge.clone(),
        api,
        username,
    };
    let routes = http::router(bridge).merge(webhook_router(handler, config.webhook_secret));

    if on_lambda {
        lambda_http::run(routes).await.map_err(|e| anyhow!(e))
    } else {
        let listener = tokio::net::TcpListener::bind(SocketAddr::new(
            Ipv4Addr::UNSPECIFIED.into(),
            config.port,
        ))
        .await?;
        info!(port = config.port, "Serving");
        axum::serve(listener, routes).await?;
        Ok(())
    }
}

fn webhook_router(handler: UpdateHandler, secret: String) -> Router {
    Router::new()
        .route("/telegram/webhook", post(webhook))
        .with_state(Arc::new(WebhookState { handler, secret }))
}

struct WebhookState {
    handler: UpdateHandler,
    secret: String,
}

// Telegram retries an update which isn't answered with 200, and sends them one at a time
async fn webhook(
    State(state): State<Arc<WebhookState>>,
    headers: HeaderMap,
    Json(update): Json<Update>,
) -> StatusCode {
    let secret = headers
        .get("x-telegram-bot-api-secret-token")
        .and_then(|v| v.to_str().ok());
    if secret != Some(state.secret.as_str()) {
        return StatusCode::UNAUTHORIZED;
    }

    match state.handler.handle(update).await {
        Ok(()) => StatusCode::OK,
        Err(error) if error.downcast_ref::<PermanentFailure>().is_some() => {
            // Retrying won't help, and would hold up the updates after it
            warn!(%error, "Failed to relay an update");
            StatusCode::OK
        }
        Err(error) => {
            warn!(%error, "Failed to relay an update, so Telegram will retry it");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

// Registers the webhook and the bot's commands with Telegram, run once after deploying
async fn setup(api: &TelegramApi, config: &Config) -> Result<()> {
    let public_url = config
        .public_url
        .as_deref()
        .context("Set PUBLIC_URL to the bridge's url")?;
    let me = api.get_me().await?;
    if me.can_read_all_group_messages != Some(true) {
        warn!(
            "Privacy mode is on, so the bot only sees commands and replies to it in groups. \
            Turn it off with BotFather's /setprivacy."
        );
    }
    api.set_webhook(
        &format!("{public_url}/telegram/webhook"),
        &config.webhook_secret,
    )
    .await?;
    api.set_my_commands(
        &[
            ("bridge", "Bridge this group with OpenChat"),
            ("unbridge", "Stop bridging this group with OpenChat"),
            (
                "status",
                "Show whether this group is bridged, and whether you're linked",
            ),
        ],
        "all_group_chats",
    )
    .await?;
    api.set_my_commands(
        &[
            (
                "status",
                "Show whether your Telegram account is linked to OpenChat",
            ),
            ("unlink", "Unlink your Telegram account from OpenChat"),
        ],
        "all_private_chats",
    )
    .await?;
    info!(
        url = format!("{public_url}/telegram/webhook"),
        "Telegram is set up"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use ic_agent::identity::AnonymousIdentity;
    use oc_bridge_core::{InMemoryStore, OpenChatConfig};
    use tower::ServiceExt;

    async fn router() -> Router {
        let openchat = OpenChat::with_identity(
            OpenChatConfig::mainnet(String::new()),
            Box::new(AnonymousIdentity),
        )
        .await
        .unwrap();
        let api = Arc::new(TelegramApi::new("token".to_string()));
        let store = BridgeStore::new(Arc::new(InMemoryStore::default()), BridgePlatform::Telegram);
        let platform = Telegram {
            api: api.clone(),
            username: "OCBridgeBot".to_string(),
            avatars: None,
        };
        let bridge = Arc::new(Bridge::new(openchat, store, platform));
        // Its OpenChat runtime can't be dropped within async code
        std::mem::forget(bridge.clone());
        let handler = UpdateHandler {
            bridge,
            api,
            username: "OCBridgeBot".to_string(),
        };
        webhook_router(handler, "secret".to_string())
    }

    #[tokio::test]
    async fn the_webhook_only_accepts_telegrams_updates() {
        for secret in [None, Some("wrong")] {
            let mut request =
                Request::post("/telegram/webhook").header("content-type", "application/json");
            if let Some(secret) = secret {
                request = request.header("x-telegram-bot-api-secret-token", secret);
            }
            let response = router()
                .await
                .oneshot(request.body(Body::from(r#"{"update_id": 1}"#)).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }

        // An update with nothing the bridge handles, so nothing is sent to Telegram
        let response = router()
            .await
            .oneshot(
                Request::post("/telegram/webhook")
                    .header("content-type", "application/json")
                    .header("x-telegram-bot-api-secret-token", "secret")
                    .body(Body::from(r#"{"update_id": 1}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
}
