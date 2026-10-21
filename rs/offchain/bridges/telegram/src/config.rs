use anyhow::{Context, Result};
use oc_bridge_core::OpenChatConfig;
use sha2::{Digest, Sha256};
use std::env;

/// From environment variables, as set on the Lambda function
pub struct Config {
    pub telegram_token: String,
    /// The bot's username. Without it, it's looked up, which adds a call to Telegram to each cold
    /// start.
    pub bot_username: Option<String>,
    /// Telegram sends it with each update, so the webhook only accepts Telegram's. It's derived from
    /// the token, as anyone with the token could register their own webhook anyway.
    pub webhook_secret: String,
    /// Where the bridge is served, which `setup` registers as Telegram's webhook
    pub public_url: Option<String>,
    pub openchat: OpenChatConfig,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let telegram_token = var("TELEGRAM_TOKEN").context("Set TELEGRAM_TOKEN")?;

        Ok(Config {
            webhook_secret: webhook_secret(&telegram_token),
            telegram_token,
            bot_username: var("TELEGRAM_BOT_USERNAME")
                .map(|u| u.trim_start_matches('@').to_string()),
            public_url: var("PUBLIC_URL").map(|url| url.trim_end_matches('/').to_string()),
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

// In hex, as Telegram only accepts A-Z, a-z, 0-9, _ and -
fn webhook_secret(token: &str) -> String {
    Sha256::new()
        .chain_update("oc_telegram_bridge webhook secret:")
        .chain_update(token)
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_webhook_secret_is_derived_from_the_token() {
        let secret = webhook_secret("123456:ABC-DEF");
        assert_eq!(secret, webhook_secret("123456:ABC-DEF"));
        assert_ne!(secret, webhook_secret("123456:ABC-DEG"));
        assert_eq!(secret.len(), 64);
        assert!(secret.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
