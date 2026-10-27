//! Bridges Twitch channels' chats with OpenChat groups and public channels, both ways. See the
//! README.

use crate::api::TwitchApi;
use crate::chat::ChatHandler;
use crate::config::Config;
use crate::platform::Twitch;
use anyhow::{Context, Result, anyhow};
use oc_bots_sdk::types::BridgePlatform;
use oc_bridge_core::{Bridge, BridgeStore, OpenChat, http};
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, info, warn};

mod api;
mod chat;
mod config;
mod eventsub;
mod oauth;
mod platform;
mod profiles;
mod rate_limit;
mod stream;
mod whispers;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = Config::from_env()?;
    let api = Arc::new(TwitchApi::new(config.client_id, config.client_secret));
    let bot = api
        .user_by_login(&config.bot_login)
        .await?
        .with_context(|| format!("Twitch has no account {}", config.bot_login))?;
    let conduit_id = eventsub::conduit(&api).await?;
    info!(bot = bot.login, conduit = conduit_id, "Twitch bot");

    let store = BridgeStore::from_env(BridgePlatform::Twitch).await;
    let openchat = OpenChat::new(config.openchat).await?;
    info!(principal = %openchat.principal(), "OpenChat bot");

    let platform = Twitch::new(
        api.clone(),
        bot.id,
        bot.login,
        config.public_url,
        conduit_id.clone(),
        store.clone(),
    );
    let bridge = Arc::new(Bridge::new(openchat, store, platform));
    // Kept alive until the process exits, as the OpenChat runtime can't be dropped from within
    // async code
    std::mem::forget(bridge.clone());

    // Twitch requires an app which keeps a user's token, as the bridge does the bot's, to check it
    // when it starts, then hourly
    let validating = bridge.clone();
    tokio::spawn(async move {
        let mut hourly = tokio::time::interval(Duration::from_secs(60 * 60));
        loop {
            hourly.tick().await;
            let platform = &validating.platform;
            if let Err(error) = platform.bot_token.validate(&platform.api).await {
                warn!(%error, "Failed to check the bot's token");
            }
        }
    });

    let routes = http::router(bridge.clone()).merge(oauth::router(bridge.clone()));
    let listener =
        tokio::net::TcpListener::bind(SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), config.port))
            .await?;
    info!(port = config.port, "Serving");

    let chat = Arc::new(ChatHandler::new(bridge));
    // The EventSub connection reconnects whenever it's lost, so only the HTTP server can stop
    tokio::select! {
        result = axum::serve(listener, routes) => {
            error!(?result, "The HTTP server stopped");
            Err(anyhow!("The HTTP server stopped"))
        }
        result = eventsub::run(api, conduit_id, chat) => {
            error!(?result, "Stopped receiving Twitch's events");
            Err(anyhow!("Stopped receiving Twitch's events"))
        }
        _ = shutdown_signal() => {
            info!("Shutting down");
            Ok(())
        }
    }
}

async fn shutdown_signal() {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("Failed to listen for SIGTERM");
        tokio::select! {
            _ = ctrl_c => {}
            _ = terminate.recv() => {}
        }
    }
    #[cfg(not(unix))]
    let _ = ctrl_c.await;
}
