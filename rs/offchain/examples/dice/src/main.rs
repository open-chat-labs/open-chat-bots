use crate::config::Config;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Json;
use axum::routing::{get, post};
use axum::{Extension, Router};
use commands::coin::Coin;
use commands::roll::Roll;
use oc_bots_sdk::api::command::{CommandHandlerRegistry, CommandResponse};
use oc_bots_sdk::api::definition::BotDefinition;
use oc_bots_sdk::oc_api::client::ClientFactory;
use oc_bots_sdk_offchain::env;
use oc_bots_sdk_offchain::middleware::tower::{ExtractJwtLayer, OpenChatJwt};
use oc_bots_sdk_offchain::AgentRuntime;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::info;

mod commands;
mod config;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Get config file path from the args, or if not set, use default
    let config_file_path = std::env::args()
        .nth(1)
        .unwrap_or("./config.toml".to_string());

    // Load & parse config
    let Config {
        pem_file,
        ic_url,
        oc_public_key,
        port,
    } = Config::from_file(&config_file_path)?;

    tracing_subscriber::fmt::init();

    info!("DiceBot starting");

    let agent = oc_bots_sdk_offchain::build_agent(ic_url, &pem_file).await;

    let oc_client_factory = Arc::new(ClientFactory::new(AgentRuntime::new(
        agent,
        tokio::runtime::Runtime::new()?,
    )));

    let commands = CommandHandlerRegistry::new(oc_client_factory.clone())
        .register(Coin)
        .register(Roll);

    let app_state = AppState {
        oc_client_factory,
        oc_public_key,
        commands,
    };

    let routes = Router::new()
        .route("/execute_command", post(execute_command))
        .route_layer(ExtractJwtLayer::new())
        .fallback(get(bot_definition))
        .layer(CorsLayer::permissive())
        .with_state(Arc::new(app_state));

    let socket_addr = SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), port);
    let listener = tokio::net::TcpListener::bind(socket_addr).await?;

    info!("DiceBot ready");

    axum::serve(listener, routes).await?;
    Ok(())
}

async fn execute_command(
    State(state): State<Arc<AppState>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
) -> (StatusCode, Bytes) {
    match state
        .commands
        .execute(&jwt, &state.oc_public_key, env::now())
        .await
    {
        CommandResponse::Success(r) => {
            (StatusCode::OK, Bytes::from(serde_json::to_vec(&r).unwrap()))
        }
        CommandResponse::BadRequest(r) => (
            StatusCode::BAD_REQUEST,
            Bytes::from(serde_json::to_vec(&r).unwrap()),
        ),
        CommandResponse::InternalError(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Bytes::from(serde_json::to_vec(&err).unwrap()),
        ),
        CommandResponse::TooManyRequests => (StatusCode::TOO_MANY_REQUESTS, Bytes::new()),
    }
}

async fn bot_definition(State(state): State<Arc<AppState>>, _body: String) -> Json<BotDefinition> {
    Json(BotDefinition {
        description: "Use this bot to roll dice or toss coins".to_string(),
        commands: state.commands.definitions(),
        autonomous_config: None,
    })
}

struct AppState {
    #[allow(dead_code)]
    oc_client_factory: Arc<ClientFactory<AgentRuntime>>,
    oc_public_key: String,
    commands: CommandHandlerRegistry<AgentRuntime>,
}
