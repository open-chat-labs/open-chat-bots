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
use oc_bots_sdk::api::action::{ActionHandlerRegistry, ActionHttpResponse, ActionResponse};
use oc_bots_sdk::api::command::{CommandHandlerRegistry, CommandResponse};
use oc_bots_sdk::api::definition::{
    AutonomousConfig, BotDefinition, BotPermissions, MessagePermission,
};
use oc_bots_sdk::oc_api::actions::{ActionArgsBuilder, installation_events};
use oc_bots_sdk::oc_api::client::{Client, ClientFactory};
use oc_bots_sdk::types::{CanisterId, InstallationLocationType, UserId};
use oc_bots_sdk_offchain::middleware::tower::{ExtractJwtLayer, OpenChatJwt};
use oc_bots_sdk_offchain::{AgentRuntime, env};
use std::collections::HashSet;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tokio::sync::OnceCell;
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
        user_index_canister_id,
        port,
    } = Config::from_file(&config_file_path)?;

    tracing_subscriber::fmt::init();

    info!("TicTacToeBot starting");

    let agent = oc_bots_sdk_offchain::build_agent(ic_url, &pem_file).await;

    let oc_client_factory = Arc::new(ClientFactory::new(AgentRuntime::new(
        agent,
        tokio::runtime::Runtime::new()?,
    )));

    // The games being played, in memory, so they're lost if the bot is restarted
    let games = Arc::new(Games::default());

    let commands = CommandHandlerRegistry::new(oc_client_factory.clone()).register(NewGame {
        games: games.clone(),
    });

    let actions =
        ActionHandlerRegistry::new(oc_client_factory.clone()).register(PlayTicTacToe { games });

    let app_state = AppState {
        oc_public_key,
        user_index: oc_client_factory.build(user_index_canister_id),
        bot_id: OnceCell::new(),
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
    let response = match state.bot_id().await {
        Ok(bot_id) => {
            state
                .actions
                .execute(&jwt, &body, &state.oc_public_key, bot_id, env::now())
                .await
        }
        Err(error) => ActionResponse::internal_error(error),
    };

    let ActionHttpResponse {
        status_code,
        content_type,
        body,
    } = response.into_http();

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
            permissions: BotPermissions::from_message_permission(MessagePermission::MiniApp),
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
    user_index: Client<AgentRuntime, CanisterId>,
    bot_id: OnceCell<UserId>,
    commands: CommandHandlerRegistry<AgentRuntime>,
    actions: ActionHandlerRegistry<AgentRuntime>,
}

impl AppState {
    // The user id OpenChat gave the bot when it was registered, which is what session tokens are
    // for, rather than the bot's principal. It's fetched when the first press arrives, as the bot is
    // started before it's registered, then kept.
    async fn bot_id(&self) -> Result<UserId, String> {
        self.bot_id
            .get_or_try_init(|| async {
                match self
                    .user_index
                    .installation_events()
                    .size(0)
                    .execute_async()
                    .await
                {
                    Ok(installation_events::Response::Success(result)) => Ok(result.bot_id),
                    other => Err(format!("Failed to look up the bot's id: {other:?}")),
                }
            })
            .await
            .copied()
    }
}
