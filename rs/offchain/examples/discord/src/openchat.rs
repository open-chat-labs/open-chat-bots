use crate::config::OpenChatConfig;
use crate::errors::BotError;
use crate::state::BotState;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use oc_bots_sdk::api::command::{CommandHandlerRegistry, CommandResponse};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::client::ClientFactory;
use oc_bots_sdk_offchain::middleware::tower::{ExtractJwtLayer, OpenChatJwt};
use oc_bots_sdk_offchain::{env, AgentRuntime};
use poise::serenity_prelude::Message;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tokio::sync::mpsc::Receiver;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::{error, info};
pub use types::*;

pub mod commands;
pub mod events;
pub mod types;

// Init OC client
//
// Initialises OC client factory and data!
pub async fn init_openchat_client(
    oc_config: &OpenChatConfig,
    state: Arc<BotState>,
) -> Result<OcData, BotError> {
    // Init OC agent
    let oc_agent = oc_bots_sdk_offchain::build_agent(
        oc_config.ic_url.clone(),
        &oc_config.bot.private_key_path,
    )
    .await;

    // Init client factory!
    let oc_client_factory = Arc::new(ClientFactory::new(AgentRuntime::new(
        oc_agent,
        tokio::runtime::Runtime::new().map_err(BotError::FailedOpenChatClientInit)?,
    )));

    // Register commands!
    let commands =
        CommandHandlerRegistry::new(oc_client_factory.clone()).register(commands::Status {
            shared_state: state.clone(),
        });

    // Init data required for OC side of things
    Ok(OcData::new(
        oc_client_factory,
        oc_config.clone(),
        commands,
        state,
    ))
}

// Start OC server
//
// Server for serving commands! Runs in a separate thread.
pub async fn start_openchat_bot(
    data: Arc<OcData>,
    port: u16,
    rx: Receiver<Message>,
) -> Result<(), BotError> {
    // Start listening for messages comming from the Discord bot
    let thread_data = data.clone();
    let oc_events =
        tokio::spawn(async move { events::handle_openchat_events(thread_data, rx).await });

    // OC bot setup!
    let routes = Router::new()
        .route("/execute_command", post(execute_command))
        .route_layer(ExtractJwtLayer::new())
        .fallback(get(bot_definition))
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive()),
        )
        .with_state(data);

    let socket_addr = SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), port);
    let listener = tokio::net::TcpListener::bind(socket_addr)
        .await
        .map_err(BotError::FailedToStartOcServer)?;

    info!("Bot server running on port http://{}", socket_addr);
    axum::serve(listener, routes)
        .await
        .expect("Failed to start OpenChat bot server!");

    let _ = tokio::join!(oc_events);
    Ok(())
}

// Handler for command execution!
async fn execute_command(
    State(oc_data): State<Arc<OcData>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
) -> (StatusCode, Bytes) {
    let res = oc_data
        .commands
        .execute(&jwt, &oc_data.oc_config.public_key, env::now())
        .await;

    match res {
        CommandResponse::Success(r) => {
            info!("OpenChat :: command executed successfully!");
            //? should we use unwrap
            (StatusCode::OK, Bytes::from(serde_json::to_vec(&r).unwrap()))
        }
        CommandResponse::BadRequest(r) => {
            error!("OpenChat :: command failed with bad request :: {:?}", r);
            (
                StatusCode::BAD_REQUEST,
                Bytes::from(serde_json::to_vec(&r).unwrap()),
            )
        }
        CommandResponse::InternalError(err) => {
            error!(
                "OpenChat :: command failed with internal error :: {:?}",
                err
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Bytes::from(format!("{err:?}")),
            )
        }
        CommandResponse::TooManyRequests => {
            error!("OpenChat :: command failed with _too many_ request!");
            (StatusCode::TOO_MANY_REQUESTS, Bytes::new())
        }
    }
}

// Handler for returning the bot definition!
async fn bot_definition(State(oc_data): State<Arc<OcData>>) -> Json<BotDefinition> {
    info!("OpenChat :: bot definition requested!");

    Json(BotDefinition {
        description: "Bot for proxying messages from Discord to OpenChat".to_string(),
        commands: oc_data.commands.definitions(),
        autonomous_config: Some(AutonomousConfig {
            permissions: BotPermissions::text_only(),
            sync_api_key: false,
        }),
    })
}
