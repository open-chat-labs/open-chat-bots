//! Hosting games through OpenChat's MiniApp service, which sits between OpenChat's website and the
//! bots whose games are played from MiniApp cards. Only the service records who joins a game, and
//! only it writes the game's card: the bot answers the service's calls asking it to accept a player
//! and telling it one left, and tells the service how the game goes, with
//! [`MiniAppServiceClient::update`].
use crate::env;
use oc_bots_sdk::jwt;
use oc_bots_sdk::oc_api::Runtime;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::actions::mini_app_token;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{
    CanisterId, Milliseconds, MiniAppGame, MiniAppPlayerClaims, MiniAppTokenType, TimestampMillis,
    TokenError, UserId,
};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::sync::Mutex;

// The bot's token lasts an hour, and is replaced when it has less than this left
const BOT_TOKEN_REFRESH_MARGIN: Milliseconds = 5 * 60 * 1000;

/// A client for the MiniApp service's bot API, with which a bot registers the games it posts and
/// tells the service how they go. It calls the service with the bot's token, which it gets from a
/// LocalUserIndex and replaces before it expires.
pub struct MiniAppServiceClient<R> {
    http: reqwest::Client,
    url: String,
    oc_client: Client<R, CanisterId>,
    bot_token: Mutex<Option<BotToken>>,
}

struct BotToken {
    token: String,
    expires: TimestampMillis,
}

impl<R: Runtime> MiniAppServiceClient<R> {
    /// `url` is the service's, and `oc_client` gets the bot's token, from any LocalUserIndex, eg.
    /// `oc_client_factory.build(context.api_gateway)`
    pub fn new(url: impl Into<String>, oc_client: Client<R, CanisterId>) -> Self {
        MiniAppServiceClient {
            http: reqwest::Client::new(),
            url: url.into(),
            oc_client,
            bot_token: Mutex::new(None),
        }
    }

    /// Registers a game the bot has just posted, with the `mini_app_registration` that sending its
    /// card returned, which is valid for an hour. Registering again does nothing. Until it's
    /// registered, no one can join the game.
    ///
    /// Gives the game, by which the service names it in its calls to the bot and its tokens, read
    /// from the registration. The service verifies the registration itself.
    pub async fn register(&self, registration: &str) -> Result<MiniAppGame, MiniAppServiceError> {
        #[derive(Deserialize)]
        struct RegistrationClaims {
            game: MiniAppGame,
        }
        #[derive(Serialize)]
        struct RegisterArgs<'a> {
            registration: &'a str,
        }

        let game = jwt::decode_unverified::<RegistrationClaims>(registration)
            .map_err(|error| {
                MiniAppServiceError::Invalid(format!("Invalid registration: {error}"))
            })?
            .game;

        self.post("bot/register", &RegisterArgs { registration })
            .await?;

        Ok(game)
    }

    /// Tells the service how one of the bot's games goes: its status, whose turn it is, its result,
    /// players to take off it, and its state for everyone with it open. The service writes the
    /// card from it.
    pub async fn update(&self, update: GameUpdate) -> Result<(), MiniAppServiceError> {
        self.post("bot/update", &update).await
    }

    /// The service's public key, a PEM, which verifies its tokens, eg. with a [`MiniAppVerifier`]
    pub async fn public_key(&self) -> Result<String, MiniAppServiceError> {
        let response = self.http.get(self.endpoint("public_key")).send().await?;
        let response = check(response).await?;

        Ok(response.text().await?)
    }

    // A call with the bot's token. If the service refuses it, eg. as it was revoked, it's
    // replaced, and the call made again, once.
    async fn post<T: Serialize>(&self, path: &str, body: &T) -> Result<(), MiniAppServiceError> {
        let send = |token: String| {
            self.http
                .post(self.endpoint(path))
                .bearer_auth(token)
                .json(body)
                .send()
        };

        let mut response = send(self.bot_token(false).await?).await?;
        if response.status() == StatusCode::UNAUTHORIZED {
            response = send(self.bot_token(true).await?).await?;
        }
        check(response).await?;

        Ok(())
    }

    // The bot's token, from the last call unless it's about to expire or `replace` is set
    async fn bot_token(&self, replace: bool) -> Result<String, MiniAppServiceError> {
        #[derive(Deserialize)]
        struct Expiry {
            exp: u64,
        }

        if !replace
            && let Some(cached) = self.bot_token.lock().unwrap().as_ref()
            && cached.expires > env::now() + BOT_TOKEN_REFRESH_MARGIN
        {
            return Ok(cached.token.clone());
        }

        let token = match self.oc_client.mini_app_token().execute_async().await {
            Ok(mini_app_token::Response::Success(token)) => token,
            Ok(response) => return Err(MiniAppServiceError::BotToken(format!("{response:?}"))),
            Err((code, message)) => {
                return Err(MiniAppServiceError::BotToken(format!("{code}: {message}")));
            }
        };
        let expiry = jwt::decode_unverified::<Expiry>(&token)
            .map_err(|error| MiniAppServiceError::BotToken(error.to_string()))?;

        *self.bot_token.lock().unwrap() = Some(BotToken {
            token: token.clone(),
            expires: expiry.exp * 1000,
        });
        Ok(token)
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}/{path}", self.url.trim_end_matches('/'))
    }
}

// The service explains a refusal in `{ "error": "..." }`, except for a body too big, which is
// refused before it's read
async fn check(response: reqwest::Response) -> Result<reqwest::Response, MiniAppServiceError> {
    #[derive(Deserialize)]
    struct ErrorBody {
        error: String,
    }

    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body = response.text().await.unwrap_or_default();
    let message = serde_json::from_str::<ErrorBody>(&body).map_or(body, |body| body.error);

    Err(MiniAppServiceError::from_status(status.as_u16(), message))
}

/// Why the MiniApp service refused a call, with its explanation, or why it couldn't be made
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MiniAppServiceError {
    /// 400: eg. a status moving back, a result without Finished, waiting for someone who isn't
    /// playing, or a registration which is invalid or has expired
    Invalid(String),
    /// 401: the service refused the bot's token, even a new one
    Unauthorized(String),
    /// 403: another bot's game
    NotTheBotsGame(String),
    /// 404: a game the service doesn't know, eg. one which wasn't registered
    UnknownGame(String),
    /// 409: the game has finished, so it can't change
    Finished(String),
    /// 413: the update is over 64 KB
    TooLarge(String),
    /// Any other status, eg. 503, when the service couldn't read or save the game, so the bot can
    /// try again
    Status(u16, String),
    /// The service couldn't be reached, or its answer read
    Request(String),
    /// The bot couldn't get its token from the LocalUserIndex
    BotToken(String),
}

impl MiniAppServiceError {
    fn from_status(status: u16, message: String) -> Self {
        match status {
            400 => MiniAppServiceError::Invalid(message),
            401 => MiniAppServiceError::Unauthorized(message),
            403 => MiniAppServiceError::NotTheBotsGame(message),
            404 => MiniAppServiceError::UnknownGame(message),
            409 => MiniAppServiceError::Finished(message),
            413 => MiniAppServiceError::TooLarge(message),
            _ => MiniAppServiceError::Status(status, message),
        }
    }
}

impl From<reqwest::Error> for MiniAppServiceError {
    fn from(error: reqwest::Error) -> Self {
        MiniAppServiceError::Request(error.to_string())
    }
}

impl Error for MiniAppServiceError {}

impl Display for MiniAppServiceError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            MiniAppServiceError::Invalid(message) => write!(f, "Invalid: {message}"),
            MiniAppServiceError::Unauthorized(message) => write!(f, "Unauthorized: {message}"),
            MiniAppServiceError::NotTheBotsGame(message) => {
                write!(f, "Not the bot's game: {message}")
            }
            MiniAppServiceError::UnknownGame(message) => write!(f, "Unknown game: {message}"),
            MiniAppServiceError::Finished(message) => write!(f, "Finished: {message}"),
            MiniAppServiceError::TooLarge(message) => write!(f, "Too large: {message}"),
            MiniAppServiceError::Status(status, message) => write!(f, "Status {status}: {message}"),
            MiniAppServiceError::Request(message) => write!(f, "Request failed: {message}"),
            MiniAppServiceError::BotToken(message) => {
                write!(f, "Couldn't get the bot's token: {message}")
            }
        }
    }
}

/// Where a game's got to, which only moves forward: Open → Active → Finished, or Open → Finished
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum GameStatus {
    /// Taking players
    Open,
    /// Being played, which closes joining. The card records the game's players as it starts.
    Active,
    /// Over, which ends the game. The card keeps the players it started with, and the result.
    Finished,
}

/// What [`MiniAppServiceClient::update`] changes about a game. Whatever isn't set stays as it was.
///
/// ```ignore
/// // The game starts, with Alice to move
/// let update = GameUpdate::new(game)
///     .with_status(GameStatus::Active)
///     .with_waiting_for(vec![alice])
///     .with_state(GameState { seq: 1, shared, private });
/// ```
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GameUpdate {
    pub game: MiniAppGame,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<GameStatus>,
    /// Whose turn it is now
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub waiting_for: Option<Vec<UserId>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    /// Players to take off the game
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub remove: Vec<UserId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<GameState>,
}

/// A game's state, which goes to everyone with the game open
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GameState {
    /// Must increase with each state, as the service drops one whose `seq` isn't above the last
    pub seq: u64,
    /// What everyone sees, players and spectators alike. Include a format version, so that an app
    /// left open from an older release knows to reload, and the last move, so that the app can
    /// animate it.
    pub shared: Value,
    /// Each player's own part, eg. their hand, which only they get
    #[serde(default)]
    pub private: HashMap<UserId, Value>,
}

impl GameUpdate {
    pub fn new(game: MiniAppGame) -> Self {
        GameUpdate {
            game,
            status: None,
            waiting_for: None,
            result: None,
            remove: Vec::new(),
            state: None,
        }
    }

    pub fn with_status(mut self, status: GameStatus) -> Self {
        self.status = Some(status);
        self
    }

    /// Whose turn it is now: players, each once, or no one, eg. when it's no one in particular
    pub fn with_waiting_for(mut self, waiting_for: Vec<UserId>) -> Self {
        self.waiting_for = Some(waiting_for);
        self
    }

    /// eg. "Bob won", of at most 200 characters, which only comes with `GameStatus::Finished`
    pub fn with_result(mut self, result: impl Into<String>) -> Self {
        self.result = Some(result.into());
        self
    }

    /// Takes players off the game. Once it has started, the card keeps the players it started
    /// with, and only the live card changes.
    pub fn with_removed(mut self, players: Vec<UserId>) -> Self {
        self.remove = players;
        self
    }

    /// The game's state, of at most 64 KB with the rest of the update
    pub fn with_state(mut self, state: GameState) -> Self {
        self.state = Some(state);
        self
    }
}

/// The bot's answer to the service's `POST <endpoint>/mini_app/join`, within 5 seconds
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct JoinResponse {
    pub accepted: bool,
    /// Why not, eg. "Seats are taken", which is shown to the user
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl JoinResponse {
    pub fn accept() -> Self {
        JoinResponse {
            accepted: true,
            message: None,
        }
    }

    pub fn refuse(message: impl Into<String>) -> Self {
        JoinResponse {
            accepted: false,
            message: Some(message.into()),
        }
    }
}

/// Verifies the MiniApp service's tokens, which come in the `x-oc-jwt` header, eg. as taken by
/// `middleware::tower::ExtractJwtLayer`. `service_public_key` is the service's, from
/// [`MiniAppServiceClient::public_key`], and `bot_id` is the user id OpenChat gave the bot when it
/// was registered.
#[derive(Clone, Debug)]
pub struct MiniAppVerifier {
    service_public_key: String,
    bot_id: UserId,
}

impl MiniAppVerifier {
    pub fn new(service_public_key: String, bot_id: UserId) -> Self {
        MiniAppVerifier {
            service_public_key,
            bot_id,
        }
    }

    /// The service's `POST <endpoint>/mini_app/join`: the user asks to join the game. Answer with a
    /// [`JoinResponse`], within 5 seconds. The bot can update the game before it answers, eg. to
    /// start it once it's full. If the service then can't add them, as the game started or filled
    /// up meanwhile, it tells the bot they left.
    pub fn join(&self, x_oc_jwt: &str) -> Result<MiniAppPlayerClaims, TokenError> {
        self.verify(x_oc_jwt, MiniAppTokenType::Join)
    }

    /// The service's `POST <endpoint>/mini_app/leave`: the user left the game, or isn't playing
    /// after all, eg. as the bot accepted them too late. Answer 200, even for someone who isn't a
    /// player, as the service tries again otherwise.
    pub fn leave(&self, x_oc_jwt: &str) -> Result<MiniAppPlayerClaims, TokenError> {
        self.verify(x_oc_jwt, MiniAppTokenType::Leave)
    }

    /// A request from a player's app. A player token outlives a removal by up to an hour, so check
    /// the user is still one of the game's players too.
    pub fn player(&self, x_oc_jwt: &str) -> Result<MiniAppPlayerClaims, TokenError> {
        self.verify(x_oc_jwt, MiniAppTokenType::Player)
    }

    fn verify(
        &self,
        jwt: &str,
        token_type: MiniAppTokenType,
    ) -> Result<MiniAppPlayerClaims, TokenError> {
        MiniAppPlayerClaims::parse(
            jwt,
            &self.service_public_key,
            token_type,
            self.bot_id,
            env::now(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ct_codecs::{Base64UrlSafeNoPadding, Encoder};
    use ic_agent::export::Principal;
    use oc_bots_sdk::msgpack;
    use oc_bots_sdk::types::{CallResult, Chat};
    use p256::ecdsa::signature::Signer;
    use p256::ecdsa::{Signature, SigningKey};
    use p256::pkcs8::{EncodePublicKey, LineEnding};
    use serde_json::json;
    use std::collections::VecDeque;
    use std::future::Future;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn id(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    fn game() -> MiniAppGame {
        MiniAppGame {
            chat: Chat::Group(id(1)),
            thread: None,
            message_id: u64::MAX.into(),
        }
    }

    fn game_json() -> Value {
        json!({ "chat": { "Group": id(1).to_string() }, "thread": null, "message_id": "18446744073709551615" })
    }

    // As the service's `UpdateArgs` reads it
    #[test]
    fn an_update_is_sent_with_only_what_it_sets() {
        assert_eq!(
            serde_json::to_value(GameUpdate::new(game())).unwrap(),
            json!({ "game": game_json() })
        );

        let update = GameUpdate::new(game())
            .with_status(GameStatus::Finished)
            .with_waiting_for(vec![id(2)])
            .with_result("Bob won")
            .with_removed(vec![id(3)])
            .with_state(GameState {
                seq: 12,
                shared: json!({ "version": 1, "last_move": 4 }),
                private: HashMap::from([(id(2), json!({ "hand": [1, 2] }))]),
            });
        assert_eq!(
            serde_json::to_value(&update).unwrap(),
            json!({
                "game": game_json(),
                "status": "Finished",
                "waiting_for": [id(2).to_string()],
                "result": "Bob won",
                "remove": [id(3).to_string()],
                "state": {
                    "seq": 12,
                    "shared": { "version": 1, "last_move": 4 },
                    "private": { id(2).to_string(): { "hand": [1, 2] } },
                },
            })
        );
        let json = serde_json::to_string(&update).unwrap();
        assert_eq!(serde_json::from_str::<GameUpdate>(&json).unwrap(), update);

        // Waiting for no one in particular is sent, as it's a change
        assert_eq!(
            serde_json::to_value(GameUpdate::new(game()).with_waiting_for(Vec::new())).unwrap(),
            json!({ "game": game_json(), "waiting_for": [] })
        );
        for (status, expected) in [
            (GameStatus::Open, "Open"),
            (GameStatus::Active, "Active"),
            (GameStatus::Finished, "Finished"),
        ] {
            assert_eq!(serde_json::to_value(status).unwrap(), json!(expected));
        }
    }

    #[test]
    fn a_join_is_answered_as_the_protocol_says() {
        assert_eq!(
            serde_json::to_value(JoinResponse::accept()).unwrap(),
            json!({ "accepted": true })
        );
        assert_eq!(
            serde_json::to_value(JoinResponse::refuse("Seats are taken")).unwrap(),
            json!({ "accepted": false, "message": "Seats are taken" })
        );
        assert_eq!(
            serde_json::from_value::<JoinResponse>(json!({ "accepted": false })).unwrap(),
            JoinResponse {
                accepted: false,
                message: None,
            }
        );
    }

    fn encode(bytes: &[u8]) -> String {
        Base64UrlSafeNoPadding::encode_to_string(bytes).unwrap()
    }

    // Signed as the service signs its tokens, with ES256
    fn service_token(key: &SigningKey, claim_type: &str, bot: UserId) -> String {
        let claims = json!({
            "exp": env::now() / 1000 + 60,
            "claim_type": claim_type,
            "bot": bot,
            "game": game(),
            "user_id": id(4),
        });
        let authenticated = format!(
            "{}.{}",
            encode(br#"{"alg":"ES256"}"#),
            encode(claims.to_string().as_bytes())
        );
        let signature: Signature = key.sign(authenticated.as_bytes());
        format!("{authenticated}.{}", encode(&signature.to_bytes()))
    }

    #[test]
    fn each_call_takes_only_its_own_token() {
        let key = SigningKey::from_slice(&[7; 32]).unwrap();
        let public_key = key
            .verifying_key()
            .to_public_key_pem(LineEnding::LF)
            .unwrap();
        let verifier = MiniAppVerifier::new(public_key, id(2));
        type Verify = fn(&MiniAppVerifier, &str) -> Result<MiniAppPlayerClaims, TokenError>;
        let calls: [(&str, Verify); 3] = [
            ("MiniAppJoin", MiniAppVerifier::join),
            ("MiniAppLeave", MiniAppVerifier::leave),
            ("MiniAppPlayer", MiniAppVerifier::player),
        ];

        for (claim_type, call) in calls {
            for (other, _) in calls {
                let result = call(&verifier, &service_token(&key, other, id(2)));
                if other == claim_type {
                    assert_eq!(
                        result.unwrap(),
                        MiniAppPlayerClaims {
                            bot: id(2),
                            game: game(),
                            user_id: id(4),
                        }
                    );
                } else {
                    assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
                }
            }
            let result = call(&verifier, &service_token(&key, claim_type, id(9)));
            assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
        }
    }

    // Gives a token for each call, which says when it expires and, in place of its signature, its
    // name
    struct FakeLocalUserIndex {
        tokens: Mutex<VecDeque<String>>,
    }

    fn bot_token(name: &str, lasts_seconds: u64) -> String {
        let claims = format!(r#"{{"exp":{}}}"#, env::now() / 1000 + lasts_seconds);
        format!("e30.{}.{name}", encode(claims.as_bytes()))
    }

    impl Runtime for FakeLocalUserIndex {
        async fn call_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
            &self,
            _: CanisterId,
            _: &str,
            _: A,
        ) -> CallResult<R> {
            unimplemented!()
        }

        async fn query_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
            &self,
            _: CanisterId,
            method_name: &str,
            _: A,
        ) -> CallResult<R> {
            assert_eq!(method_name, "bot_mini_app_token_msgpack");
            let token = self.tokens.lock().unwrap().pop_front().unwrap();
            let response = mini_app_token::Response::Success(token);
            Ok(msgpack::deserialize_then_unwrap(
                &msgpack::serialize_then_unwrap(response),
            ))
        }

        fn spawn<F: Future<Output = ()> + Send + 'static>(&self, _: F) {
            unimplemented!()
        }

        fn now(&self) -> TimestampMillis {
            env::now()
        }

        fn is_canister(&self) -> bool {
            false
        }
    }

    // A request as the service got it: its method and path, the token it came with, and its body
    #[derive(Debug, PartialEq)]
    struct Request {
        line: String,
        token: Option<String>,
        body: String,
    }

    // A service which answers each request with the next of `responses`, and records them
    async fn serve(responses: Vec<(u16, &'static str)>) -> (String, Arc<Mutex<Vec<Request>>>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let recorded = requests.clone();

        tokio::spawn(async move {
            for (status, body) in responses {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut bytes = Vec::new();
                let mut buffer = [0; 4096];
                let (head, mut content) = loop {
                    let read = stream.read(&mut buffer).await.unwrap();
                    bytes.extend_from_slice(&buffer[..read]);
                    let text = String::from_utf8_lossy(&bytes).to_string();
                    if let Some((head, content)) = text.split_once("\r\n\r\n") {
                        break (head.to_string(), content.to_string());
                    }
                };
                let header = |name: &str| {
                    head.lines().find_map(|line| {
                        let (key, value) = line.split_once(": ")?;
                        key.eq_ignore_ascii_case(name).then(|| value.to_string())
                    })
                };
                let length: usize = header("content-length").map_or(0, |l| l.parse().unwrap());
                while content.len() < length {
                    let read = stream.read(&mut buffer).await.unwrap();
                    content.push_str(&String::from_utf8_lossy(&buffer[..read]));
                }
                recorded.lock().unwrap().push(Request {
                    line: head.lines().next().unwrap().to_string(),
                    token: header("authorization").map(|a| a.replace("Bearer ", "")),
                    body: content,
                });

                let response = format!(
                    "HTTP/1.1 {status} X\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(response.as_bytes()).await.unwrap();
            }
        });

        (url, requests)
    }

    fn client(url: String, tokens: Vec<String>) -> MiniAppServiceClient<FakeLocalUserIndex> {
        let local_user_index = FakeLocalUserIndex {
            tokens: Mutex::new(tokens.into()),
        };
        MiniAppServiceClient::new(url, Client::new(Arc::new(local_user_index), id(5)))
    }

    #[tokio::test]
    async fn keeps_the_bot_token_and_replaces_it_once_when_refused() {
        let (url, requests) = serve(vec![
            (200, "{}"),
            (401, r#"{"error":"Invalid bot token"}"#),
            (200, "{}"),
            (401, r#"{"error":"Invalid bot token"}"#),
            (401, r#"{"error":"Invalid bot token"}"#),
        ])
        .await;
        let tokens = [
            bot_token("a", 3600),
            bot_token("b", 3600),
            bot_token("c", 3600),
        ];
        let client = client(url, tokens.to_vec());

        assert_eq!(client.update(GameUpdate::new(game())).await, Ok(()));
        assert_eq!(client.update(GameUpdate::new(game())).await, Ok(()));
        assert_eq!(
            client.update(GameUpdate::new(game())).await,
            Err(MiniAppServiceError::Unauthorized(
                "Invalid bot token".to_string()
            ))
        );

        let requests = requests.lock().unwrap();
        let sent: Vec<_> = requests.iter().map(|r| r.token.clone().unwrap()).collect();
        let [a, b, c] = tokens;
        assert_eq!(sent, [a.clone(), a, b.clone(), b, c]);
        assert!(
            requests
                .iter()
                .all(|r| r.line == "POST /bot/update HTTP/1.1")
        );
        assert_eq!(
            serde_json::from_str::<Value>(&requests[0].body).unwrap(),
            json!({ "game": game_json() })
        );
    }

    #[tokio::test]
    async fn replaces_a_bot_token_about_to_expire() {
        let (url, requests) = serve(vec![(200, "{}"), (200, "{}")]).await;
        let tokens = [bot_token("a", 60), bot_token("b", 3600)];
        let client = client(url, tokens.to_vec());

        for _ in 0..2 {
            assert_eq!(client.update(GameUpdate::new(game())).await, Ok(()));
        }

        let sent: Vec<_> = requests
            .lock()
            .unwrap()
            .iter()
            .map(|r| r.token.clone().unwrap())
            .collect();
        assert_eq!(sent, tokens);
    }

    #[tokio::test]
    async fn gives_the_service_s_refusals() {
        let (url, _) = serve(vec![
            (409, r#"{"error":"The game has finished"}"#),
            (413, "length limit exceeded"),
            (503, r#"{"error":"Unavailable"}"#),
        ])
        .await;
        let client = client(url, vec![bot_token("a", 3600)]);

        for expected in [
            MiniAppServiceError::Finished("The game has finished".to_string()),
            MiniAppServiceError::TooLarge("length limit exceeded".to_string()),
            MiniAppServiceError::Status(503, "Unavailable".to_string()),
        ] {
            assert_eq!(client.update(GameUpdate::new(game())).await, Err(expected));
        }
    }

    #[tokio::test]
    async fn registers_a_game_and_fetches_the_public_key() {
        let (url, requests) = serve(vec![(200, "{}"), (200, "-----BEGIN PUBLIC KEY-----")]).await;
        let token = bot_token("a", 3600);
        let client = client(url, vec![token.clone()]);
        let registration = format!(
            "e30.{}.signature",
            encode(
                json!({ "claim_type": "MiniAppRegistration", "game": game() })
                    .to_string()
                    .as_bytes()
            )
        );

        assert_eq!(client.register(&registration).await, Ok(game()));
        assert_eq!(
            client.public_key().await,
            Ok("-----BEGIN PUBLIC KEY-----".to_string())
        );

        let requests = requests.lock().unwrap();
        assert_eq!(
            requests[0],
            Request {
                line: "POST /bot/register HTTP/1.1".to_string(),
                token: Some(token),
                body: json!({ "registration": registration }).to_string(),
            }
        );
        assert_eq!(requests[1].line, "GET /public_key HTTP/1.1");
        assert_eq!(requests[1].token, None);
    }
}
