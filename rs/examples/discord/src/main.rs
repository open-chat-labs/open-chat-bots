pub mod config;
pub mod discord;
pub mod errors;
pub mod openchat;
pub mod state;

use crate::config::Config;
use dotenv::dotenv;
use serde_valid::Validate;
use state::AesKey;
use std::sync::Arc;
use tokio::sync::mpsc::channel;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load env file if available!
    dotenv().ok();

    // Get config file path from env - if not set, use default.
    let config_file_path = std::env::var("CONFIG_FILE").unwrap_or("./config.toml".to_string());

    // Load & parse config...
    let config = Config::from_file(&config_file_path)?;

    // Valdate system config, specifically encryption key to make sure it's 32 bits
    config.system.validate()?;

    // Initialise log tracing!
    let subscriber = tracing_subscriber::FmtSubscriber::builder()
        .with_max_level(config.system.log_level)
        .finish();

    tracing::subscriber::set_global_default(subscriber)?;

    // Init state!
    let state = Arc::new(
        state::BotState::builder()
            .with_encryption_key(config.system.store_encryption_key.map(AesKey))
            .with_store_path(config.system.store_path)
            .build()
            .await?,
    );

    // Channel for passing messages from discord to openchat part of the bot!
    // We could integrate this functionality, but channels are a nice way to
    // separate that concern + we could test these functionalities separately.
    // TODO buffer size is arbitrary - ymmv -, we could make it a config value...
    let (tx, rx) = channel(32);

    // Init client! Cloning state is cheap since it's an Arc.
    let mut discord_client =
        crate::discord::init_discord_client(&config.discord, state.clone(), tx).await?;
    let openchat_client =
        crate::openchat::init_openchat_client(&config.openchat, state.clone()).await?;

    // Run bots in their respective threads
    let (ds_res, oc_res) = tokio::join!(
        tokio::spawn(async move { discord_client.start().await }),
        tokio::spawn(crate::openchat::start_openchat_bot(
            Arc::new(openchat_client),
            config.openchat.bot.port,
            rx,
        )),
    );

    let _ = ds_res.expect("Discord bot failed!");
    let _ = oc_res.expect("OpenChat bot failed!");

    Ok(())
}
