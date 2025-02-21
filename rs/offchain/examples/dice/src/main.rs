use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::Router;
use clap::Parser;
use commands::coin::Coin;
use commands::roll::Roll;
use oc_bots_sdk::api::{BotDefinition, CommandHandler, CommandResponse};
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk_offchain::env;
use oc_bots_sdk_offchain::AgentRuntime;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

mod commands;

#[tokio::main]
async fn main() {
    dotenv::dotenv().unwrap();
    tracing_subscriber::fmt::init();

    let config = Config::parse();
    let ic_url = dotenv::var("IC_URL").expect("IC_URL not set");
    let oc_public_key = dotenv::var("OC_PUBLIC_KEY").expect("OC_PUBLIC_KEY not set");

    let agent = oc_bots_sdk_offchain::build_agent(ic_url, &config.pem_file).await;

    let oc_client_factory = Arc::new(ClientFactory::new(AgentRuntime::new(
        agent,
        tokio::runtime::Runtime::new().unwrap(),
    )));

    let commands = CommandHandler::new(oc_client_factory.clone())
        .register(Coin)
        .register(Roll);

    let app_state = AppState {
        oc_client_factory,
        oc_public_key,
        commands,
    };

    let routes = Router::new()
        .route("/execute_command", post(execute_command))
        .route("/", get(bot_definition))
        .layer(CorsLayer::permissive())
        .with_state(Arc::new(app_state));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();

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
        description: "Use this bot to roll dice or toss coins".to_string(),
        commands: state.commands.definitions(),
        autonomous_config: None,
    };

    (
        StatusCode::OK,
        Bytes::from(serde_json::to_vec(&definition).unwrap()),
    )
}

struct AppState {
    #[allow(dead_code)]
    oc_client_factory: Arc<ClientFactory<AgentRuntime>>,
    oc_public_key: String,
    commands: CommandHandler<AgentRuntime>,
}

#[derive(Parser, Debug)]
struct Config {
    #[arg(long)]
    pem_file: String,
}
