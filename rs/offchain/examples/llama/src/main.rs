use crate::commands::prompt::Prompt;
use crate::config::Config;
use crate::llm_canister_agent::LlmCanisterAgent;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::Router;
use dotenv::dotenv;
use oc_bots_sdk::api::command::{CommandHandlerRegistry, CommandResponse};
use oc_bots_sdk::api::definition::BotDefinition;
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk_offchain::env;
use oc_bots_sdk_offchain::AgentRuntime;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::{error, info};

mod commands;
mod config;
mod errors;
mod llm_canister_agent;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load .env file if present
    dotenv().ok();

    // Get config file path from env - if not set, use default
    let config_file_path = std::env::var("CONFIG_FILE").unwrap_or("./config.toml".to_string());

    // Load & parse config
    let config = Config::from_file(&config_file_path)?;

    tracing_subscriber::fmt::SubscriberBuilder::default()
        .with_max_level(config.log_level)
        .init();

    info!(?config, "LlamaBot starting");

    let agent = oc_bots_sdk_offchain::build_agent(config.ic_url, &config.pem_file).await;

    let oc_client_factory = Arc::new(ClientFactory::new(AgentRuntime::new(
        agent.clone(),
        tokio::runtime::Runtime::new().unwrap(),
    )));

    let llm_canister_agent = LlmCanisterAgent::new(agent);

    let commands =
        CommandHandlerRegistry::new(oc_client_factory).register(Prompt::new(llm_canister_agent));

    let app_state = AppState {
        oc_public_key: config.oc_public_key,
        commands,
    };

    let routes = Router::new()
        .route("/execute_command", post(execute_command))
        .route("/", get(bot_definition))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(Arc::new(app_state));

    let socket_addr = SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), config.port);
    let listener = tokio::net::TcpListener::bind(socket_addr).await.unwrap();

    info!("LlamaBot ready");

    axum::serve(listener, routes).await?;
    Ok(())
}

async fn execute_command(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> (StatusCode, Bytes) {
    let jwt = if let Some(val) = headers.get("x-oc-jwt") {
        if let Ok(jwt) = val.to_str() {
            jwt
        } else {
            error!("Failed to parse authorization header! :: {:?}", val);
            return (
                StatusCode::BAD_REQUEST,
                Bytes::from("Failed to parse authorization header!"),
            );
        }
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Bytes::from("No authorization header found!"),
        );
    };

    match state
        .commands
        .execute(jwt, &state.oc_public_key, env::now())
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

async fn bot_definition(State(state): State<Arc<AppState>>, _body: String) -> (StatusCode, Bytes) {
    let definition = BotDefinition {
        description: "Use this bot to send prompts to the Llama3 LLM".to_string(),
        commands: state.commands.definitions(),
        autonomous_config: None,
    };

    (
        StatusCode::OK,
        Bytes::from(serde_json::to_vec(&definition).unwrap()),
    )
}

struct AppState {
    oc_public_key: String,
    commands: CommandHandlerRegistry<AgentRuntime>,
}
