use crate::commands::prompt::Prompt;
use crate::llm_canister_agent::LlmCanisterAgent;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::Router;
use clap::Parser;
use oc_bots_sdk::api::command::{CommandHandlerRegistry, CommandResponse};
use oc_bots_sdk::api::definition::BotDefinition;
use oc_bots_sdk::consts::{IC_URL, OC_PUBLIC_KEY};
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk_offchain::env;
use oc_bots_sdk_offchain::AgentRuntime;
use std::net::{Ipv4Addr, SocketAddr};
use std::str::FromStr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::{info, trace};

mod commands;
mod llm_canister_agent;

#[tokio::main]
async fn main() {
    dotenv::dotenv().unwrap();
    tracing_subscriber::fmt::init();

    info!("LlamaBot starting");

    let pem_file = dotenv::var("PEM_FILE").expect("PEM_FILE must be set");
    let ic_url = dotenv::var("IC_URL").unwrap_or(IC_URL.to_string());
    let oc_public_key = dotenv::var("OC_PUBLIC_KEY").unwrap_or(OC_PUBLIC_KEY.to_string());
    let port = dotenv::var("PORT").map_or(3000, |p| u16::from_str(&p).unwrap());

    info!("IC_URL: {ic_url}");
    info!("OC_PUBLIC_KEY: {oc_public_key}");
    info!("PORT: {port}");

    let agent = oc_bots_sdk_offchain::build_agent(ic_url, &pem_file).await;

    let oc_client_factory = Arc::new(ClientFactory::new(AgentRuntime::new(
        agent.clone(),
        tokio::runtime::Runtime::new().unwrap(),
    )));

    let llm_canister_agent = LlmCanisterAgent::new(agent);

    let commands =
        CommandHandlerRegistry::new(oc_client_factory).register(Prompt::new(llm_canister_agent));

    let app_state = AppState {
        oc_public_key,
        commands,
    };

    let routes = Router::new()
        .route("/execute_command", post(execute_command))
        .route("/", get(bot_definition))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(Arc::new(app_state));

    let socket_addr = SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), port);
    let listener = tokio::net::TcpListener::bind(socket_addr).await.unwrap();

    info!("LlamaBot ready");

    axum::serve(listener, routes).await.unwrap();
}

async fn execute_command(State(state): State<Arc<AppState>>, jwt: String) -> (StatusCode, Bytes) {
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
            Bytes::from(format!("{err:?}")),
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

#[derive(Parser, Debug)]
struct Config {
    #[arg(long)]
    pem_file: String,
}
