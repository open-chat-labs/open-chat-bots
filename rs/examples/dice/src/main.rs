use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::Router;
use clap::Parser;
use oc_bots_sdk::api::{
    BotDefinition, MessagePermission, NumberParam, SlashCommandParam, SlashCommandParamType,
    SlashCommandPermissions, SlashCommandSchema,
};
use oc_bots_sdk::OpenChatClient;
use oc_bots_sdk_offchain::AgentRuntime;
use std::collections::HashSet;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

mod execute_command;

#[tokio::main]
async fn main() {
    dotenv::dotenv().unwrap();
    tracing_subscriber::fmt::init();

    let config = Config::parse();
    let ic_url = dotenv::var("IC_URL").expect("IC_URL not set");
    let oc_public_key = dotenv::var("OC_PUBLIC_KEY").expect("OC_PUBLIC_KEY not set");

    let agent = oc_bots_sdk_offchain::build_agent(ic_url, &config.pem_file).await;
    let app_state = AppState {
        oc_client: OpenChatClient::new(AgentRuntime::new(
            agent,
            tokio::runtime::Runtime::new().unwrap(),
        )),
        oc_public_key,
    };

    let routes = Router::new()
        .route("/execute_command", post(execute_command))
        .route("/", get(bot_definition_as_string()))
        .layer(CorsLayer::permissive())
        .with_state(Arc::new(app_state));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();

    axum::serve(listener, routes).await.unwrap();
}

async fn execute_command(State(state): State<Arc<AppState>>, jwt: String) -> (StatusCode, Bytes) {
    match execute_command::execute_command(jwt, &state.oc_client, &state.oc_public_key).await {
        Ok(message) => (
            StatusCode::OK,
            Bytes::from(serde_json::to_vec(&message).unwrap()),
        ),
        Err(error) => (StatusCode::BAD_REQUEST, Bytes::from(format!("{error:?}"))),
    }
}

fn bot_definition_as_string() -> String {
    serde_json::to_string(&bot_definition()).unwrap()
}

fn bot_definition() -> BotDefinition {
    BotDefinition {
        description: "Use this bot to roll dice or toss coins".to_string(),
        commands: vec![
            SlashCommandSchema {
                name: "roll".to_string(),
                description: Some("Let's roll some dice!".to_string()),
                placeholder: Some("Rolling...".to_string()),
                params: vec![
                    SlashCommandParam {
                        name: "sides".to_string(),
                        description: Some("The number of sides on each die".to_string()),
                        placeholder: Some("6".to_string()),
                        required: false,
                        param_type: SlashCommandParamType::NumberParam(NumberParam {
                            min_value: 1f64,
                            max_value: u32::MAX.into(),
                            choices: Vec::new(),
                        }),
                    },
                    SlashCommandParam {
                        name: "count".to_string(),
                        description: Some("The number of dice to roll".to_string()),
                        placeholder: Some("1".to_string()),
                        required: false,
                        param_type: SlashCommandParamType::NumberParam(NumberParam {
                            min_value: 1f64,
                            max_value: 10f64,
                            choices: Vec::new(),
                        }),
                    },
                ],
                permissions: SlashCommandPermissions {
                    message: HashSet::from_iter([MessagePermission::Text]),
                    ..Default::default()
                },
            },
            SlashCommandSchema {
                name: "coin".to_string(),
                description: Some("Let's toss some coins!".to_string()),
                placeholder: Some("Tossing...".to_string()),
                params: vec![SlashCommandParam {
                    name: "count".to_string(),
                    description: Some("The number of coins to toss".to_string()),
                    placeholder: Some("1".to_string()),
                    required: false,
                    param_type: SlashCommandParamType::NumberParam(NumberParam {
                        min_value: 1f64,
                        max_value: 10f64,
                        choices: Vec::new(),
                    }),
                }],
                permissions: SlashCommandPermissions {
                    message: HashSet::from_iter([MessagePermission::Text]),
                    ..Default::default()
                },
            },
        ],
    }
}

struct AppState {
    oc_client: OpenChatClient<AgentRuntime>,
    oc_public_key: String,
}

#[derive(Parser, Debug)]
struct Config {
    #[arg(long)]
    pem_file: String,
}
