use anyhow::{Context, Result, anyhow};
use oc_bridge_core::OpenChatConfig;
use std::env;

/// From environment variables, as the bridge runs in a container
pub struct Config {
    pub discord_token: String,
    /// For linking accounts through Discord's OAuth. Without them, linking is turned off.
    pub oauth: Option<OAuthConfig>,
    pub openchat: OpenChatConfig,
    pub port: u16,
}

pub struct OAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    /// Where the bridge is served, eg. https://discord-bridge.oc.app. Discord redirects users back
    /// to `{public_url}/oauth/callback`, which must be one of the app's OAuth redirects.
    pub public_url: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let openchat = OpenChatConfig::from_env()?;

        let oauth = match (
            var("DISCORD_CLIENT_ID"),
            var("DISCORD_CLIENT_SECRET"),
            var("PUBLIC_URL"),
        ) {
            (Some(client_id), Some(client_secret), Some(public_url)) => Some(OAuthConfig {
                client_id,
                client_secret,
                public_url: public_url.trim_end_matches('/').to_string(),
            }),
            (None, None, _) => None,
            _ => {
                return Err(anyhow!(
                    "Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and PUBLIC_URL to link accounts"
                ));
            }
        };

        Ok(Config {
            discord_token: var("DISCORD_TOKEN").context("Set DISCORD_TOKEN")?,
            oauth,
            openchat,
            port: var("PORT")
                .map_or(Ok(8080), |p| p.parse())
                .context("Invalid PORT")?,
        })
    }
}

fn var(name: &str) -> Option<String> {
    env::var(name).ok().filter(|v| !v.trim().is_empty())
}
