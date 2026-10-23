use anyhow::{Context, Result};
use oc_bridge_core::OpenChatConfig;
use std::env;

/// From environment variables, as the bridge runs in a container
pub struct Config {
    /// The Twitch app's, which the bridge gets its app access token with
    pub client_id: String,
    pub client_secret: String,
    /// The login of the Twitch account the bot chats as, eg. "openchatbridge"
    pub bot_login: String,
    /// Where the bridge is served, eg. https://twitch-bridge.oc.app. Twitch redirects users back to
    /// `{public_url}/oauth/callback`, which must be one of the app's OAuth redirects.
    pub public_url: String,
    pub openchat: OpenChatConfig,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Config {
            client_id: var("TWITCH_CLIENT_ID").context("Set TWITCH_CLIENT_ID")?,
            client_secret: var("TWITCH_CLIENT_SECRET").context("Set TWITCH_CLIENT_SECRET")?,
            bot_login: var("TWITCH_BOT_LOGIN")
                .context("Set TWITCH_BOT_LOGIN")?
                .trim_start_matches('@')
                .to_lowercase(),
            public_url: var("PUBLIC_URL")
                .context("Set PUBLIC_URL")?
                .trim_end_matches('/')
                .to_string(),
            openchat: OpenChatConfig::from_env()?,
            port: var("PORT")
                .map_or(Ok(8080), |p| p.parse())
                .context("Invalid PORT")?,
        })
    }
}

fn var(name: &str) -> Option<String> {
    env::var(name).ok().filter(|v| !v.trim().is_empty())
}
