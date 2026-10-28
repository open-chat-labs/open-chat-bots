use crate::command::Press;
use crate::config::Config;
use crate::presses::Presses;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::CACHE_CONTROL;
use axum::response::{Html, IntoResponse, Json};
use axum::routing::{get, post};
use axum::{Extension, Router};
use oc_bots_sdk::api::command::{CommandHandlerRegistry, CommandResponse};
use oc_bots_sdk::api::definition::{AutonomousConfig, BotDefinition, BotPermissions};
use oc_bots_sdk::oc_api::actions::{ActionArgsBuilder, installation_events};
use oc_bots_sdk::oc_api::client::{Client, ClientFactory};
use oc_bots_sdk::types::{
    ActionScope, AutonomousContext, CanisterId, InstallationLocationType, UnitResult, UserId,
};
use oc_bots_sdk_offchain::middleware::tower::{ExtractJwtLayer, OpenChatJwt};
use oc_bots_sdk_offchain::{AgentRuntime, env};
use std::collections::HashSet;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::OnceCell;
use tower_http::cors::CorsLayer;
use tracing::{error, info};

mod api;
mod command;
mod config;
mod presses;

/// The app OpenChat opens, in a frame, from the card's Open button: the button, the counts, and the
/// script which talks to OpenChat and to the bot's API
const APP: &str = include_str!("app.html");

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

    info!("PressCounterBot starting");

    let agent = oc_bots_sdk_offchain::build_agent(ic_url, &pem_file).await;

    let oc_client_factory = Arc::new(ClientFactory::new(AgentRuntime::new(
        agent,
        tokio::runtime::Runtime::new()?,
    )));

    let app_state = AppState {
        oc_public_key,
        user_index: oc_client_factory.build(user_index_canister_id),
        bot_id: OnceCell::new(),
        commands: CommandHandlerRegistry::new(oc_client_factory.clone()).register(Press),
        presses: Presses::default(),
        oc_client_factory,
    };
    let app_state = Arc::new(app_state);

    tokio::spawn(update_cards(app_state.clone()));

    let routes = routes(app_state);

    let socket_addr = SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), port);
    let listener = tokio::net::TcpListener::bind(socket_addr).await?;

    info!("PressCounterBot ready on port {port}");

    axum::serve(listener, routes).await?;
    Ok(())
}

fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/execute_command", post(execute_command))
        .route("/api/presses", get(api::presses))
        .route("/api/press", post(api::press))
        // Each of the routes above needs a token: OpenChat's for a command, or the app's
        .route_layer(ExtractJwtLayer::new())
        .route("/app", get(app))
        .fallback(get(bot_definition))
        // For OpenChat's website, which calls `/execute_command` from its own origin. The app calls
        // the API from the bot's origin, so needs none, unless OpenChat frames it without
        // `allow-same-origin`, when its origin is opaque.
        .layer(CorsLayer::permissive())
        .with_state(state)
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

/// How often the bot brings the cards up to date
const UPDATE_CARDS_INTERVAL: Duration = Duration::from_secs(2);

// Keeps each card showing its players, that the game's on once anyone has pressed, and how many
// others have the app open. The bot updates its cards autonomously, as itself, which needs no
// permission beyond being installed. Updates go one at a time, so they land in order.
async fn update_cards(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(UPDATE_CARDS_INTERVAL);
    loop {
        interval.tick().await;
        for update in state.presses.due_updates(env::now()) {
            let client = state.oc_client_factory.build(AutonomousContext {
                api_gateway: update.api_gateway,
                scope: ActionScope::Chat(update.card.chat),
            });
            let response = client
                .update_mini_app(update.card.message_id, update.update.clone())
                .in_thread(update.card.thread)
                .execute_async()
                .await;

            if matches!(response, Ok(UnitResult::Success)) {
                state.presses.updated(&update, env::now());
            } else {
                error!("Failed to update a card, {update:?}: {response:?}");
                state.presses.failed(&update, env::now());
            }
        }
    }
}

// OpenChat opens the bot's endpoint followed by `/app`. The page needs no token to load: OpenChat
// gives it one once it's running.
async fn app() -> impl IntoResponse {
    ([(CACHE_CONTROL, "no-cache")], Html(APP))
}

async fn bot_definition(State(state): State<Arc<AppState>>, _body: String) -> Json<BotDefinition> {
    Json(BotDefinition {
        description: "A button for everyone in your chat to press. Run /press to post one, then \
            tap Open on it to press it and see how many times each member has."
            .to_string(),
        commands: state.commands.definitions(),
        // To update its cards from the background task, as itself, OpenChat needs the bot installed
        // to act autonomously. It needs no permissions for that, as a card is its own message.
        autonomous_config: Some(AutonomousConfig {
            permissions: BotPermissions::empty(),
        }),
        default_subscriptions: None,
        // MiniApp messages can't be sent in direct chats
        restricted_locations: Some(HashSet::from([
            InstallationLocationType::Community,
            InstallationLocationType::Group,
        ])),
    })
}

pub struct AppState {
    oc_public_key: String,
    oc_client_factory: Arc<ClientFactory<AgentRuntime>>,
    user_index: Client<AgentRuntime, CanisterId>,
    bot_id: OnceCell<UserId>,
    commands: CommandHandlerRegistry<AgentRuntime>,
    presses: Presses,
}

impl AppState {
    // The user id OpenChat gave the bot when it was registered, which is what session tokens are
    // for, rather than the bot's principal. It's fetched when the app first calls, as the bot is
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
                    other => Err(format!(
                        "Failed to look up the bot's id. Has it been registered? {other:?}"
                    )),
                }
            })
            .await
            .copied()
    }
}

// The routes as OpenChat's website and the app call them, with tokens signed as OpenChat signs them
#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{Body, to_bytes};
    use axum::http::Request;
    use ct_codecs::{Base64UrlSafeNoPadding, Encoder};
    use ic_agent::Agent;
    use ic_principal::Principal;
    use oc_bots_sdk::types::{Chat, MessageId, MiniAppStatus, MiniAppUpdate};
    use p256::ecdsa::signature::Signer;
    use p256::ecdsa::{Signature, SigningKey};
    use p256::pkcs8::{EncodePublicKey, LineEnding};
    use serde_json::{Value, json};
    use tower::ServiceExt;

    fn id(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    const BOT: u8 = 2;

    fn key() -> SigningKey {
        SigningKey::from_slice(&[7; 32]).unwrap()
    }

    fn token(claims: Value) -> String {
        let encode = |bytes: &[u8]| Base64UrlSafeNoPadding::encode_to_string(bytes).unwrap();
        let header = encode(br#"{"alg":"ES256"}"#);
        let claims = encode(claims.to_string().as_bytes());
        let signature: Signature = key().sign(format!("{header}.{claims}").as_bytes());
        format!("{header}.{claims}.{}", encode(&signature.to_bytes()))
    }

    // A session token for the user, on the card with the message id in group 9, as OpenChat writes it
    fn session(user: u8, message_id: u64) -> Value {
        json!({
            "exp": env::now() / 1000 + 900,
            "claim_type": "BotMessageSession",
            "bot_api_gateway": id(1).to_string(),
            "bot": id(BOT).to_string(),
            "chat": { "Group": id(9).to_string() },
            "thread": null,
            "message_id": message_id.to_string(),
            "user_id": id(user).to_string(),
            "meta": null,
        })
    }

    struct Bot {
        // Kept here so that the runtime it holds is dropped outside `block_on`
        state: Arc<AppState>,
        runtime: tokio::runtime::Runtime,
    }

    impl Bot {
        fn new() -> Self {
            let agent = Agent::builder()
                .with_url("https://icp-api.io")
                .build()
                .unwrap();
            let factory = Arc::new(ClientFactory::new(AgentRuntime::new(
                agent,
                tokio::runtime::Runtime::new().unwrap(),
            )));
            let state = AppState {
                oc_public_key: key()
                    .verifying_key()
                    .to_public_key_pem(LineEnding::LF)
                    .unwrap(),
                user_index: factory.build(id(5)),
                // As if it had been looked up already
                bot_id: OnceCell::new_with(Some(id(BOT))),
                commands: CommandHandlerRegistry::new(factory.clone()).register(Press),
                presses: Presses::default(),
                oc_client_factory: factory,
            };
            Bot {
                state: Arc::new(state),
                runtime: tokio::runtime::Runtime::new().unwrap(),
            }
        }

        fn call(&self, method: &str, path: &str, jwt: Option<&str>) -> (StatusCode, String) {
            let mut request = Request::builder().method(method).uri(path);
            if let Some(jwt) = jwt {
                request = request.header("x-oc-jwt", jwt);
            }
            let request = request.body(Body::empty()).unwrap();
            self.runtime.block_on(async {
                let response = routes(self.state.clone()).oneshot(request).await.unwrap();
                let status = response.status();
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                (status, String::from_utf8(body.to_vec()).unwrap())
            })
        }

        fn presses(&self, method: &str, path: &str, claims: Value) -> Value {
            let (status, body) = self.call(method, path, Some(&token(claims)));
            assert_eq!(status, StatusCode::OK, "{body}");
            serde_json::from_str(&body).unwrap()
        }
    }

    #[test]
    fn the_app_loads_without_a_token() {
        let (status, body) = Bot::new().call("GET", "/app", None);

        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("mini_app_ready"));
    }

    #[test]
    fn each_users_presses_are_counted_on_their_card() {
        let bot = Bot::new();

        bot.presses("POST", "/api/press", session(3, 1));
        bot.presses("POST", "/api/press", session(4, 1));
        let presses = bot.presses("POST", "/api/press", session(4, 1));

        assert_eq!(presses["user_id"], id(4).to_string());
        assert_eq!(presses["total"], 3);
        assert_eq!(
            presses["presses"],
            json!([
                { "user_id": id(4).to_string(), "count": 2 },
                { "user_id": id(3).to_string(), "count": 1 },
            ])
        );
        assert_eq!(
            bot.presses("GET", "/api/presses", session(5, 1))["total"],
            3
        );
        // Another card's are its own
        assert_eq!(
            bot.presses("GET", "/api/presses", session(3, 2))["total"],
            0
        );
    }

    // Through the LocalUserIndex which signed the session, in the card's chat and thread
    // So that OpenChat lets the bot update its cards autonomously
    #[test]
    fn the_bot_acts_autonomously_with_no_permissions() {
        let (status, body) = Bot::new().call("GET", "/", None);
        let definition: Value = serde_json::from_str(&body).unwrap();

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            definition["autonomous_config"],
            json!({ "permissions": {} })
        );
        assert_eq!(
            definition["commands"][0]["permissions"],
            json!({ "message": 2048 })
        );
    }

    #[test]
    fn a_first_press_puts_the_player_on_the_card() {
        let bot = Bot::new();
        bot.presses("GET", "/api/presses", session(4, 1));
        bot.presses("POST", "/api/press", session(3, 1));

        let due = bot.state.presses.due_updates(env::now());

        assert_eq!(due.len(), 1);
        assert_eq!(due[0].api_gateway, id(1));
        assert_eq!(due[0].card.chat, Chat::Group(id(9)));
        assert_eq!(due[0].card.thread, None);
        assert_eq!(due[0].card.message_id, MessageId::from(1));
        assert_eq!(
            due[0].update,
            MiniAppUpdate::default()
                .with_players(vec![id(3)])
                .with_status(MiniAppStatus::Active)
                .with_spectator_count(1)
        );
    }

    #[test]
    fn the_api_refuses_a_missing_or_bad_token_with_a_401() {
        let bot = Bot::new();
        let with = |change: fn(&mut Value)| {
            let mut claims = session(3, 1);
            change(&mut claims);
            token(claims)
        };

        let bad = [
            // For another bot
            with(|c| c["bot"] = json!(id(8).to_string())),
            // A command's
            with(|c| c["claim_type"] = json!("BotActionByCommand")),
            with(|c| c["exp"] = json!(env::now() / 1000)),
            // Not signed by OpenChat
            {
                let jwt = token(session(3, 1));
                format!("{}x", &jwt[..jwt.len() - 1])
            },
        ];

        for path in ["/api/presses", "/api/press"] {
            let method = if path == "/api/press" { "POST" } else { "GET" };
            assert_eq!(bot.call(method, path, None).0, StatusCode::UNAUTHORIZED);
            for jwt in &bad {
                let (status, body) = bot.call(method, path, Some(jwt));
                assert_eq!(status, StatusCode::UNAUTHORIZED, "{body}");
            }
        }
        assert_eq!(
            bot.presses("GET", "/api/presses", session(3, 1))["total"],
            0
        );
    }
}
