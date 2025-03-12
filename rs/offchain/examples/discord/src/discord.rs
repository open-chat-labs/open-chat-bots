pub mod commands;
pub mod events;

use crate::config::DiscordConfig;
use crate::discord::commands as discord_commands;
use crate::discord::events::event_handler;
use crate::errors::BotError;
use crate::state::BotState;
use poise::serenity_prelude as serenity;
use serenity::Message;
use std::sync::Arc;
use tokio::sync::mpsc::Sender;
use tracing::info;

pub struct LocalData {
    pub tx: Sender<Message>,
    pub state: Arc<BotState>,
}

// Bot error type
pub type Error = Box<dyn std::error::Error + Send + Sync>;

// Bot context type
pub type Context<'a> = poise::Context<'a, LocalData, Error>;

pub type FrameworkContext<'a> = poise::FrameworkContext<'a, LocalData, Error>;

// Initialise Discord client
//
// ...
pub async fn init_discord_client(
    config: &DiscordConfig,
    state: Arc<BotState>,
    tx: Sender<Message>,
) -> Result<serenity::Client, BotError> {
    let local_data = LocalData { tx, state };

    // How does the bot intend to use and access Discord data. Being able to get
    // the message content is required for proxying that message to OpenChat!
    let intents =
        serenity::GatewayIntents::non_privileged() | serenity::GatewayIntents::MESSAGE_CONTENT;

    // Commands are registered on every bot startup; any changes made between
    // restarts will be reflected on the next start-up.
    let options = poise::FrameworkOptions {
        commands: vec![
            discord_commands::status(),
            discord_commands::connect(),
            discord_commands::disconnect(),
        ],
        post_command: |ctx| {
            Box::pin(async move {
                info!(
                    "Discord :: command processed :: {}",
                    ctx.command().qualified_name
                );
            })
        },
        event_handler: |ctx, event, framework, data| {
            // Define a function that will handle events, like new message
            Box::pin(event_handler(ctx, event, framework, data))
        },
        ..Default::default()
    };

    let framework = poise::Framework::builder()
        .setup(|ctx, ready, framework| {
            Box::pin(async move {
                info!(ready.user.name, "Ready to process commands");
                poise::builtins::register_globally(ctx, &framework.options().commands).await?;
                Ok(local_data)
            })
        })
        .options(options)
        .build();

    Ok(serenity::ClientBuilder::new(config.token.clone(), intents)
        .framework(framework)
        .await?)
}
