use crate::bot::Bot;
use crate::command::Chess;
use crate::config::Config;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::CACHE_CONTROL;
use axum::response::{Html, IntoResponse, Json};
use axum::routing::{get, post};
use axum::{Extension, Router};
use oc_bots_sdk::api::command::{CommandHandlerRegistry, CommandResponse};
use oc_bots_sdk::api::definition::BotDefinition;
use oc_bots_sdk::oc_api::client::ClientFactory;
use oc_bots_sdk::types::InstallationLocationType;
use oc_bots_sdk_offchain::middleware::tower::{ExtractJwtLayer, OpenChatJwt};
use oc_bots_sdk_offchain::{AgentRuntime, env};
use std::collections::HashSet;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::info;

mod api;
mod bot;
mod chess;
mod command;
mod config;
mod games;
mod service;

/// The app OpenChat opens, in a frame, from the card's Open button: the board, the clocks, the
/// moves, and the script which talks to OpenChat and to the bot's API
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
        mini_app_service_url,
        port,
    } = Config::from_file(&config_file_path)?;

    tracing_subscriber::fmt::init();

    info!("ChessBot starting");

    let agent = oc_bots_sdk_offchain::build_agent(ic_url, &pem_file).await;

    let oc_client_factory = Arc::new(ClientFactory::new(AgentRuntime::new(
        agent,
        tokio::runtime::Runtime::new()?,
    )));

    let bot = Arc::new(Bot::new(
        oc_client_factory.clone(),
        user_index_canister_id,
        mini_app_service_url,
    ));
    let app_state = AppState {
        oc_public_key,
        commands: CommandHandlerRegistry::new(oc_client_factory)
            .register(Chess { bot: bot.clone() }),
        bot,
    };

    let routes = routes(Arc::new(app_state));

    let socket_addr = SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), port);
    let listener = tokio::net::TcpListener::bind(socket_addr).await?;

    info!("ChessBot ready on port {port}");

    axum::serve(listener, routes).await?;
    Ok(())
}

fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/execute_command", post(execute_command))
        .route("/mini_app/join", post(service::join))
        .route("/mini_app/start", post(service::start))
        .route("/mini_app/leave", post(service::leave))
        .route("/api/move", post(api::play_move))
        .route("/api/resign", post(api::resign))
        .route("/api/draw", post(api::draw))
        // Each of the routes above needs a token: OpenChat's for a command, the MiniApp service's
        // for its calls, or a player's for the app's
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

// OpenChat opens the bot's endpoint followed by `/app`. The page needs no token to load: OpenChat
// gives a player one once it's running.
async fn app() -> impl IntoResponse {
    ([(CACHE_CONTROL, "no-cache")], Html(APP))
}

async fn bot_definition(State(state): State<Arc<AppState>>, _body: String) -> Json<BotDefinition> {
    Json(BotDefinition {
        description: "Chess, with 10 minutes each on the clock. Run /chess to post a game, join \
            it with a friend, tap Open and start. Everyone else can watch."
            .to_string(),
        commands: state.commands.definitions(),
        // The service posts the card and writes to it, so the bot does nothing on its own
        autonomous_config: None,
        default_subscriptions: None,
        // MiniApp cards can't be posted in direct chats
        restricted_locations: Some(HashSet::from([
            InstallationLocationType::Community,
            InstallationLocationType::Group,
        ])),
    })
}

pub struct AppState {
    oc_public_key: String,
    commands: CommandHandlerRegistry<AgentRuntime>,
    bot: Arc<Bot>,
}

// The routes as the MiniApp service and the app call them, with tokens signed as the service
// signs them
#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{Body, to_bytes};
    use axum::http::Request;
    use axum::http::header::CONTENT_TYPE;
    use ct_codecs::{Base64UrlSafeNoPadding, Encoder};
    use ic_agent::Agent;
    use ic_principal::Principal;
    use oc_bots_sdk::types::UserId;
    use oc_bots_sdk_offchain::mini_app::MiniAppVerifier;
    use p256::ecdsa::signature::Signer;
    use p256::ecdsa::{Signature, SigningKey};
    use p256::pkcs8::{EncodePublicKey, LineEnding};
    use serde_json::{Value, json};
    use tokio::sync::OnceCell;
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

    // The service's token for the user, of the type for the call, on the game with the message id
    // in group 9
    fn claims(claim_type: &str, user: u8, message_id: u64) -> Value {
        json!({
            "exp": env::now() / 1000 + 900,
            "claim_type": claim_type,
            "bot": id(BOT).to_string(),
            "game": {
                "chat": { "Group": id(9).to_string() },
                "thread": null,
                "message_id": message_id.to_string(),
            },
            "user_id": id(user).to_string(),
        })
    }

    struct TestBot {
        // Dropped first, so that a task it still runs, eg. one sending the players who joined,
        // lets go of the bot before `state` drops the bot, and the runtime the bot holds, outside
        // of any async context
        runtime: tokio::runtime::Runtime,
        state: Arc<AppState>,
    }

    impl TestBot {
        fn new() -> Self {
            let agent = Agent::builder()
                .with_url("https://icp-api.io")
                .build()
                .unwrap();
            let factory = Arc::new(ClientFactory::new(AgentRuntime::new(
                agent,
                tokio::runtime::Runtime::new().unwrap(),
            )));
            let mut bot = Bot::new(factory.clone(), id(5), "http://127.0.0.1:1".to_string());
            // As if the service's key and the bot's id had been fetched already
            bot.verifier = OnceCell::new_with(Some(MiniAppVerifier::new(
                key()
                    .verifying_key()
                    .to_public_key_pem(LineEnding::LF)
                    .unwrap(),
                id(BOT),
            )));
            let bot = Arc::new(bot);
            let state = AppState {
                oc_public_key: String::new(),
                commands: CommandHandlerRegistry::new(factory).register(Chess { bot: bot.clone() }),
                bot,
            };
            TestBot {
                state: Arc::new(state),
                runtime: tokio::runtime::Runtime::new().unwrap(),
            }
        }

        fn call(
            &self,
            method: &str,
            path: &str,
            jwt: Option<&str>,
            body: Option<Value>,
        ) -> (StatusCode, Value) {
            let mut request = Request::builder().method(method).uri(path);
            if let Some(jwt) = jwt {
                request = request.header("x-oc-jwt", jwt);
            }
            let request = match body {
                Some(body) => request
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(body.to_string())),
                None => request.body(Body::empty()),
            }
            .unwrap();
            self.runtime.block_on(async {
                let response = routes(self.state.clone()).oneshot(request).await.unwrap();
                let status = response.status();
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let body = String::from_utf8(body.to_vec()).unwrap();
                (
                    status,
                    serde_json::from_str(&body).unwrap_or(Value::String(body)),
                )
            })
        }

        fn ok(&self, path: &str, claims: Value) -> Value {
            let (status, body) = self.call("POST", path, Some(&token(claims)), None);
            assert_eq!(status, StatusCode::OK, "{body}");
            body
        }

        fn refused(&self, path: &str, claims: Value, body: Option<Value>) -> String {
            let (status, answer) = self.call("POST", path, Some(&token(claims)), body);
            assert_eq!(status, StatusCode::CONFLICT, "{answer}");
            answer["error"].as_str().unwrap().to_string()
        }
    }

    #[test]
    fn the_app_loads_without_a_token() {
        let (status, body) = TestBot::new().call("GET", "/app", None, None);

        assert_eq!(status, StatusCode::OK);
        assert!(body.as_str().unwrap().contains("mini_app_ready"));
    }

    #[test]
    fn the_bot_needs_only_the_mini_app_permission_for_its_command() {
        let (status, definition) = TestBot::new().call("GET", "/", None, None);

        assert_eq!(status, StatusCode::OK);
        assert_eq!(definition["autonomous_config"], Value::Null);
        assert_eq!(definition["commands"][0]["name"], "chess");
        assert_eq!(
            definition["commands"][0]["permissions"],
            json!({ "message": 2048 })
        );
    }

    #[test]
    fn two_players_join_and_the_game_starts_between_them() {
        let bot = TestBot::new();

        assert_eq!(
            bot.ok("/mini_app/join", claims("MiniAppJoin", 3, 1)),
            json!({ "accepted": true })
        );
        bot.ok("/mini_app/join", claims("MiniAppJoin", 4, 1));
        bot.ok("/mini_app/leave", claims("MiniAppLeave", 4, 1));
        bot.ok("/mini_app/join", claims("MiniAppJoin", 6, 1));
        assert_eq!(
            bot.ok("/mini_app/join", claims("MiniAppJoin", 4, 1)),
            json!({ "accepted": false, "message": "This game already has two players" })
        );
        // Not a player until the game starts
        assert_eq!(
            bot.refused(
                "/api/move",
                claims("MiniAppPlayer", 3, 1),
                Some(json!({ "move": "e2e4" }))
            ),
            "Start the game first"
        );
        // Someone who left can't start it
        assert_eq!(
            bot.ok("/mini_app/start", claims("MiniAppStart", 4, 1)),
            json!({ "accepted": false, "message": "You're not in this game" })
        );

        let start = bot.ok("/mini_app/start", claims("MiniAppStart", 3, 1));

        assert_eq!(start["accepted"], true);
        let players = start["players"].as_array().unwrap();
        assert_eq!(players.len(), 2);
        assert!(players.contains(&json!(id(3).to_string())));
        assert!(players.contains(&json!(id(6).to_string())));
        // White moves first
        assert_eq!(start["waiting_for"], json!([players[0]]));
        // Above the four lobby states, sent as players joined and left
        assert_eq!(start["state"]["seq"], 5);
        assert_eq!(start["state"]["shared"]["status"], "Active");
        assert_eq!(start["state"]["shared"]["white"], players[0]);
        assert_eq!(start["state"]["shared"]["black"], players[1]);
        assert_eq!(start["state"]["shared"]["turn"], "white");
        assert_eq!(
            start["state"]["shared"]["fen"],
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        );
        assert_eq!(start["state"]["private"], json!({}));

        // Someone who left isn't playing, and a player can't move out of turn or illegally
        assert_eq!(
            bot.refused(
                "/api/move",
                claims("MiniAppPlayer", 4, 1),
                Some(json!({ "move": "e2e4" }))
            ),
            "You're not playing"
        );
        let black = if players[0] == json!(id(3).to_string()) {
            6
        } else {
            3
        };
        assert_eq!(
            bot.refused(
                "/api/move",
                claims("MiniAppPlayer", black, 1),
                Some(json!({ "move": "e7e5" }))
            ),
            "It's not your turn"
        );
        let white = if black == 3 { 6 } else { 3 };
        assert_eq!(
            bot.refused(
                "/api/move",
                claims("MiniAppPlayer", white, 1),
                Some(json!({ "move": "e2e5" }))
            ),
            "e2e5 isn't a legal move"
        );
    }

    #[test]
    fn a_game_needs_two_players() {
        let bot = TestBot::new();
        bot.ok("/mini_app/join", claims("MiniAppJoin", 3, 1));

        assert_eq!(
            bot.ok("/mini_app/start", claims("MiniAppStart", 3, 1)),
            json!({ "accepted": false, "message": "Chess needs two players" })
        );
    }

    #[test]
    fn each_call_refuses_a_missing_or_bad_token_with_a_401() {
        let bot = TestBot::new();
        let with = |claim_type: &str, change: fn(&mut Value)| {
            let mut claims = claims(claim_type, 3, 1);
            change(&mut claims);
            token(claims)
        };

        for (path, claim_type) in [
            ("/mini_app/join", "MiniAppJoin"),
            ("/mini_app/start", "MiniAppStart"),
            ("/mini_app/leave", "MiniAppLeave"),
            ("/api/move", "MiniAppPlayer"),
            ("/api/resign", "MiniAppPlayer"),
            ("/api/draw", "MiniAppPlayer"),
        ] {
            let bad = [
                // For another bot
                with(claim_type, |c| c["bot"] = json!(id(8).to_string())),
                // Another call's
                with(
                    if claim_type == "MiniAppJoin" {
                        "MiniAppPlayer"
                    } else {
                        "MiniAppJoin"
                    },
                    |_| {},
                ),
                with(claim_type, |c| c["exp"] = json!(env::now() / 1000)),
                // Not signed by the service
                {
                    let jwt = with(claim_type, |_| {});
                    format!("{}x", &jwt[..jwt.len() - 1])
                },
            ];
            assert_eq!(
                bot.call("POST", path, None, None).0,
                StatusCode::UNAUTHORIZED
            );
            for jwt in &bad {
                let (status, body) = bot.call("POST", path, Some(jwt), None);
                assert_eq!(status, StatusCode::UNAUTHORIZED, "{path}: {body}");
            }
        }
    }
}
