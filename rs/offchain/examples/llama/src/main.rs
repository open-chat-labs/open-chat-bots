use crate::commands::prompt::Prompt;
use crate::config::Config;
use crate::llm_canister_agent::LlmCanisterAgent;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use oc_bots_sdk::api::command::{CommandHandlerRegistry, CommandResponse};
use oc_bots_sdk::api::definition::BotDefinition;
use oc_bots_sdk::mainnet::IC_URL;
use oc_bots_sdk::oc_api::client::ClientFactory;
use oc_bots_sdk_offchain::env;
use oc_bots_sdk_offchain::middleware::tower::{ExtractJwtLayer, OpenChatJwt};
use oc_bots_sdk_offchain::AgentRuntime;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::info;

mod commands;
mod config;
mod llm_canister_agent;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Get config file path from the args, or if not set, use default
    let config_file_path = std::env::args()
        .nth(1)
        .unwrap_or("./config.toml".to_string());

    // Load & parse config
    let config = Config::from_file(&config_file_path)?;

    tracing_subscriber::fmt::SubscriberBuilder::default()
        .with_max_level(config.log_level)
        .init();

    info!("LlamaBot starting");

    // Init OC client
    let oc_agent = oc_bots_sdk_offchain::build_agent(config.ic_url, &config.pem_file).await;
    let oc_client_factory = Arc::new(ClientFactory::new(AgentRuntime::new(
        oc_agent,
        tokio::runtime::Runtime::new()?,
    )));

    // Init Llama3 LLM canister agent
    let llama_agent = oc_bots_sdk_offchain::build_agent(IC_URL.to_string(), &config.pem_file).await;

    let commands = CommandHandlerRegistry::new(oc_client_factory)
        .register(Prompt::new(LlmCanisterAgent::new(llama_agent)));

    let app_state = AppState {
        oc_public_key: config.oc_public_key,
        commands,
    };

    let routes = Router::new()
        .route("/execute_command", post(execute_command))
        .route_layer(ExtractJwtLayer::new())
        .fallback(get(bot_definition))
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive()),
        )
        .with_state(Arc::new(app_state));

    let socket_addr = SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), config.port);
    let listener = tokio::net::TcpListener::bind(socket_addr).await?;

    info!("LlamaBot ready");

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
        description: "Use this bot to send prompts to the Llama3 LLM".to_string(),
        commands: state.commands.definitions(),
        autonomous_config: None,
    })
}

struct AppState {
    oc_public_key: String,
    commands: CommandHandlerRegistry<AgentRuntime>,
}
