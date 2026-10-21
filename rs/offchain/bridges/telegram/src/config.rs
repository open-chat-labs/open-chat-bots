use anyhow::{Context, Result, bail};
use oc_bridge_core::OpenChatConfig;
use std::env;

/// From environment variables, as set on the Lambda function
pub struct Config {
    pub telegram_token: String,
    /// The bot's username. Without it, it's looked up, which adds a call to Telegram to each cold
    /// start.
    pub bot_username: Option<String>,
    /// Telegram sends it with each update, so the webhook only accepts Telegram's. 1 to 256 of
    /// A-Z, a-z, 0-9, _ and -.
    pub webhook_secret: String,
    /// Where the bridge is served, which `setup` registers as Telegram's webhook
    pub public_url: Option<String>,
    pub openchat: OpenChatConfig,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let webhook_secret =
            var("TELEGRAM_WEBHOOK_SECRET").context("Set TELEGRAM_WEBHOOK_SECRET")?;
        if webhook_secret.len() > 256
            || !webhook_secret
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            bail!("TELEGRAM_WEBHOOK_SECRET must be up to 256 of A-Z, a-z, 0-9, _ and -");
        }

        Ok(Config {
            telegram_token: var("TELEGRAM_TOKEN").context("Set TELEGRAM_TOKEN")?,
            bot_username: var("TELEGRAM_BOT_USERNAME")
                .map(|u| u.trim_start_matches('@').to_string()),
            webhook_secret,
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
