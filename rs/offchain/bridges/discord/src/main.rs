//! Bridges Discord channels with OpenChat groups and public channels, both ways. See the README.

use crate::config::Config;
use crate::gateway::Handler;
use crate::webhook::Discord;
use anyhow::{Result, anyhow};
use oc_bots_sdk::types::BridgePlatform;
use oc_bridge_core::{Bridge, BridgeStore, OpenChat, http};
use serenity::all::{GatewayIntents, Http};
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tracing::{error, info, warn};

mod config;
mod gateway;
mod oauth;
mod webhook;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = Config::from_env()?;

    let store = BridgeStore::from_env(BridgePlatform::Discord).await;
    let openchat = OpenChat::new(config.openchat).await?;
    info!(principal = %openchat.principal(), "OpenChat bot");

    let discord_http = Arc::new(Http::new(&config.discord_token));
    let platform = Discord {
        http: discord_http,
        client_id: config.oauth.as_ref().map(|oauth| oauth.client_id.clone()),
    };
    let bridge = Arc::new(Bridge::new(openchat, store, platform));
    // Kept alive until the process exits, as the OpenChat runtime can't be dropped from within
    // async code
    std::mem::forget(bridge.clone());

    let mut routes = http::router(bridge.clone());
    match config.oauth {
        Some(oauth) => routes = routes.merge(oauth::router(bridge.clone(), oauth)),
        None => warn!("DISCORD_CLIENT_ID isn't set, so accounts can't be linked"),
    }
    let listener =
        tokio::net::TcpListener::bind(SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), config.port))
            .await?;
    info!(port = config.port, "Serving OpenChat's requests");

    let intents =
        GatewayIntents::GUILDS | GatewayIntents::GUILD_MESSAGES | GatewayIntents::MESSAGE_CONTENT;
    let mut discord = serenity::Client::builder(&config.discord_token, intents)
        .event_handler(Handler::new(bridge))
        .await?;

    // Either stopping is a failure, eg. Discord refusing the connection because the Message
    // Content intent isn't enabled
    tokio::select! {
        result = axum::serve(listener, routes) => {
            error!(?result, "The HTTP server stopped");
            Err(anyhow!("The HTTP server stopped"))
        }
        result = discord.start() => {
            error!(?result, "The Discord connection stopped");
            Err(anyhow!("The Discord connection stopped"))
        }
        _ = shutdown_signal() => {
            info!("Shutting down");
            discord.shard_manager.shutdown_all().await;
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
