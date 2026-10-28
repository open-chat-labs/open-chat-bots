use crate::action::PlayTicTacToe;
use crate::command::NewGame;
use crate::config::Config;
use crate::game::Games;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::CONTENT_TYPE;
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use axum::{Extension, Router};
use oc_bots_sdk::api::action::{ActionHandlerRegistry, ActionHttpResponse};
use oc_bots_sdk::api::command::{CommandHandlerRegistry, CommandResponse};
use oc_bots_sdk::api::definition::{AutonomousConfig, BotDefinition, MessagePermission};
use oc_bots_sdk::oc_api::client::ClientFactory;
use oc_bots_sdk::types::{BotPermissionsBuilder, InstallationLocationType, UserId};
use oc_bots_sdk_offchain::middleware::tower::{ExtractJwtLayer, OpenChatJwt};
use oc_bots_sdk_offchain::{AgentRuntime, env};
use std::collections::HashSet;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::info;

mod action;
mod board;
mod command;
mod config;
mod game;

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

    info!("TicTacToeBot starting");

    let agent = oc_bots_sdk_offchain::build_agent(ic_url, &pem_file).await;

    // The bot's id is its identity's principal. Session tokens for other bots are refused.
    let bot_id: UserId = agent.get_principal()?.into();

    let oc_client_factory = Arc::new(ClientFactory::new(AgentRuntime::new(
        agent,
        tokio::runtime::Runtime::new()?,
    )));

    // The games being played, in memory, so they're lost if the bot is restarted
    let games = Arc::new(Games::default());

    let commands = CommandHandlerRegistry::new(oc_client_factory.clone()).register(NewGame {
        games: games.clone(),
    });

    let actions = ActionHandlerRegistry::new(oc_client_factory).register(PlayTicTacToe { games });

    let app_state = AppState {
        oc_public_key,
        bot_id,
        commands,
        actions,
    };

    let routes = Router::new()
        .route("/execute_command", post(execute_command))
        .route("/execute_action", post(execute_action))
        .route_layer(ExtractJwtLayer::new())
        .fallback(get(bot_definition))
        .layer(CorsLayer::permissive())
        .with_state(Arc::new(app_state));

    let socket_addr = SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), port);
    let listener = tokio::net::TcpListener::bind(socket_addr).await?;

    info!("TicTacToeBot ready");

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

// A press of a button on one of the bot's games, with the user's session token in the `x-oc-jwt`
// header and `{"button_id": ".."}` as the body
async fn execute_action(
    State(state): State<Arc<AppState>>,
    Extension(OpenChatJwt(jwt)): Extension<OpenChatJwt>,
    body: Bytes,
) -> Response {
    let ActionHttpResponse {
        status_code,
        content_type,
        body,
    } = state
        .actions
        .execute(&jwt, &body, &state.oc_public_key, state.bot_id, env::now())
        .await
        .into_http();

    (
        StatusCode::from_u16(status_code).unwrap(),
        [(CONTENT_TYPE, content_type)],
        body,
    )
        .into_response()
}

async fn bot_definition(State(state): State<Arc<AppState>>, _body: String) -> Json<BotDefinition> {
    Json(BotDefinition {
        description: "Play tic-tac-toe with someone in your chat. Run /tictactoe to post a game, \
            which anyone can join. Once they have, you start it, then take turns pressing the \
            squares."
            .to_string(),
        commands: state.commands.definitions(),
        // To edit the game's message as it's played
        autonomous_config: Some(AutonomousConfig {
            permissions: BotPermissionsBuilder::new()
                .with_message(MessagePermission::MiniApp)
                .with_message(MessagePermission::Text)
                .build(),
        }),
        default_subscriptions: None,
        // MiniApp messages can't be sent in direct chats
        restricted_locations: Some(HashSet::from([
            InstallationLocationType::Community,
            InstallationLocationType::Group,
        ])),
    })
}

struct AppState {
    oc_public_key: String,
    bot_id: UserId,
    commands: CommandHandlerRegistry<AgentRuntime>,
    actions: ActionHandlerRegistry<AgentRuntime>,
}
