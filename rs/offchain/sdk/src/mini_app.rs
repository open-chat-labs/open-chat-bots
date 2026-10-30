//! Hosting games through OpenChat's MiniApp service, which sits between OpenChat's website and the
//! bots whose games are played from MiniApp cards. Only the service posts a game's card, records
//! who joins it and writes to the card: the bot asks it to post the card, with
//! [`MiniAppServiceClient::post`], answers the service's calls asking it to accept a player or start
//! the game, and telling it one left, and tells the service how the game goes, with
//! [`MiniAppServiceClient::update`].
use crate::env;
use oc_bots_sdk::jwt;
use oc_bots_sdk::oc_api::Runtime;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::actions::mini_app_token;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{
    CanisterId, EventIndex, Milliseconds, MiniAppContent, MiniAppGame, MiniAppPlayerClaims,
    MiniAppTokenType, TimestampMillis, TokenError, UserId,
};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::sync::Mutex;
use std::time::Duration;

// The bot's token lasts an hour, and is replaced when it has less than this left
const BOT_TOKEN_REFRESH_MARGIN: Milliseconds = 5 * 60 * 1000;
// So a call to a service which stops answering fails, rather than holding up the bot
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// A client for the MiniApp service's bot API, with which a bot posts its cards and tells the
/// service how their games go. It calls the service with the bot's token, which it gets from a
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
            http: reqwest::Client::builder()
                .timeout(REQUEST_TIMEOUT)
                .build()
                .expect("The HTTP client builds"),
            url: url.into(),
            oc_client,
            bot_token: Mutex::new(None),
        }
    }

    /// Posts a card: the service posts it as the bot, through the LocalUserIndex, and records its
    /// game, together. `token` is a post token from the context the bot would send a message with,
    /// `client.mini_app_post_token()`, valid for an hour; `block_level_markdown` and `replies_to`
    /// are as for a message. `send_message` refuses a card, so this is the only way to post one.
    ///
    /// Gives the game, by which the service names it in its calls to the bot and its tokens, and
    /// which [`MiniAppGame::from_post_token`] reads from the token beforehand. Until the card's
    /// posted, no one can join the game, and [`update`](Self::update) answers
    /// [`UnknownGame`](MiniAppServiceError::UnknownGame).
    ///
    /// Posting the same token again posts nothing new, and gives the game. So after a timeout, or a
    /// 503 as the service couldn't reach OpenChat, post the same token again.
    pub async fn post(
        &self,
        token: &str,
        card: MiniAppContent,
        block_level_markdown: bool,
        replies_to: Option<EventIndex>,
    ) -> Result<MiniAppGame, MiniAppServiceError> {
        #[derive(Serialize)]
        struct PostArgs<'a> {
            token: &'a str,
            card: Card,
            block_level_markdown: bool,
            replies_to: Option<EventIndex>,
        }
        // The card as the service takes it: without a status, as the service posts it open, and
        // with the image's blob id as a decimal string, as message ids are
        #[derive(Serialize)]
        struct Card {
            text: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            image: Option<Image>,
            #[serde(skip_serializing_if = "Option::is_none")]
            max_players: Option<u32>,
            spectators: bool,
        }
        #[derive(Serialize)]
        struct Image {
            width: u32,
            height: u32,
            mime_type: String,
            blob_reference: BlobReference,
        }
        #[derive(Serialize)]
        struct BlobReference {
            canister_id: String,
            blob_id: String,
        }
        #[derive(Deserialize)]
        struct Posted {
            game: MiniAppGame,
        }

        let args = PostArgs {
            token,
            card: Card {
                text: card.text,
                image: card.image.map(|image| Image {
                    width: image.width,
                    height: image.height,
                    mime_type: image.mime_type,
                    blob_reference: BlobReference {
                        canister_id: image.blob_reference.canister_id.to_text(),
                        blob_id: image.blob_reference.blob_id.to_string(),
                    },
                }),
                max_players: card.max_players,
                spectators: card.spectators,
            },
            block_level_markdown,
            replies_to,
        };

        let response = self.call("bot/post", &args).await?;
        let posted: Posted = response.json().await?;

        Ok(posted.game)
    }

    /// Tells the service how one of the bot's games goes: whose turn it is, players to take off it,
    /// its state for everyone with it open, and when it's finished, its result. The service writes
    /// the card from it. A player starts the game, through the service, so an update can't.
    pub async fn update(&self, update: GameUpdate) -> Result<(), MiniAppServiceError> {
        self.call("bot/update", &update).await?;

        Ok(())
    }

    /// The service's public key, a PEM, which verifies its tokens, eg. with a [`MiniAppVerifier`]
    pub async fn public_key(&self) -> Result<String, MiniAppServiceError> {
        let response = self.http.get(self.endpoint("public_key")).send().await?;
        let response = check(response).await?;

        Ok(response.text().await?)
    }

    // A call with the bot's token, giving the service's answer if it's a success. If the service
    // refuses the token, eg. as it was revoked, it's replaced, and the call made again, once.
    async fn call<T: Serialize>(
        &self,
        path: &str,
        body: &T,
    ) -> Result<reqwest::Response, MiniAppServiceError> {
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

        check(response).await
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
    /// 400: eg. a post token which is invalid or has expired, a card OpenChat refused, a status
    /// moving back, a result without Finished, or waiting for someone who isn't playing
    Invalid(String),
    /// 401: the service refused the bot's token, even a new one
    Unauthorized(String),
    /// 403: another bot's game, or post token
    NotTheBotsGame(String),
    /// 404: a game the service doesn't know, eg. one whose card hasn't been posted
    UnknownGame(String),
    /// 409: the game has finished, so it can't change
    Finished(String),
    /// 413: the update is over 64 KB
    TooLarge(String),
    /// Any other status, eg. 503, when the service couldn't reach OpenChat, or read or save the
    /// game, so the bot can try again, a post with the same token
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

/// The status a bot can give a game. A player starts it, through the service, so the bot only ever
/// finishes it.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum GameStatus {
    /// Over, whether it started or not, which ends the game. The card keeps the players it started
    /// with, and the result.
    Finished,
}

/// What [`MiniAppServiceClient::update`] changes about a game. Whatever isn't set stays as it was.
///
/// ```ignore
/// // Alice moved, so it's Bob's turn
/// let update = GameUpdate::new(game)
///     .with_waiting_for(vec![bob])
///     .with_state(GameState { seq: 2, shared, private });
///
/// // Bob won
/// let update = GameUpdate::new(game).finished().with_result("Bob won");
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

    /// Ends the game, whether it started or not
    pub fn finished(mut self) -> Self {
        self.status = Some(GameStatus::Finished);
        self
    }

    /// Whose turn it is now: players, each once, or no one, eg. when it's no one in particular
    pub fn with_waiting_for(mut self, waiting_for: Vec<UserId>) -> Self {
        self.waiting_for = Some(waiting_for);
        self
    }

    /// eg. "Bob won", of at most 200 characters, which only comes with [`Self::finished`]
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

/// The bot's answer to the service's `POST <endpoint>/mini_app/join`, within 5 seconds, with a 200
/// whether it accepts or refuses. The service takes any other status as the bot being unavailable.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct JoinResponse {
    pub accepted: bool,
    /// Why not, eg. "Seats are taken", which is shown to the user, cut to 200 characters
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

/// The bot's answer to the service's `POST <endpoint>/mini_app/start`, within 5 seconds, with a 200
/// whether it starts the game or not. The service takes any other status as the bot being
/// unavailable.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct StartResponse {
    pub accepted: bool,
    /// Why not, eg. "Needs 2 players", which is shown to the player who asked, cut to 200 characters
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub players: Option<Vec<UserId>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub waiting_for: Option<Vec<UserId>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<GameState>,
}

impl StartResponse {
    /// Starts the game, which closes joining, and the card records its players:
    /// - `players`, in any order. Each should be playing, or have a join the bot accepted and is
    ///   still answering, which then succeeds. Anyone else isn't added, and the bot's told they
    ///   left, eg. a player whose leave hadn't reached it yet. Anyone playing whom the bot leaves
    ///   out is taken off.
    /// - `waiting_for`, whose turn it is first, as in [`GameUpdate::with_waiting_for`].
    /// - `state`, the game's first state, whose `seq` is above any state the bot has already sent.
    ///
    /// An answer which is invalid in itself fails the start: a player listed twice, more than the
    /// game's limit, waiting for someone it doesn't list, or a state that isn't newer.
    pub fn accept(players: Vec<UserId>, waiting_for: Vec<UserId>, state: GameState) -> Self {
        StartResponse {
            accepted: true,
            message: None,
            players: Some(players),
            waiting_for: Some(waiting_for),
            state: Some(state),
        }
    }

    pub fn refuse(message: impl Into<String>) -> Self {
        StartResponse {
            accepted: false,
            message: Some(message.into()),
            players: None,
            waiting_for: None,
            state: None,
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
    /// [`JoinResponse`], within 5 seconds. The user isn't a player until the service adds them,
    /// after the bot answers, so don't count them as playing until the bot's asked to
    /// [`start`](Self::start) the game, which may come while it's still answering their join. If
    /// the service can't add them, as the game started or filled up meanwhile, it tells the bot
    /// they left.
    pub fn join(&self, x_oc_jwt: &str) -> Result<MiniAppPlayerClaims, TokenError> {
        self.verify(x_oc_jwt, MiniAppTokenType::Join)
    }

    /// The service's `POST <endpoint>/mini_app/start`: the user, a player, asks to start the game.
    /// Answer with a [`StartResponse`], within 5 seconds. The service holds the game until the bot
    /// answers, so answer with the game's first state rather than calling
    /// [`MiniAppServiceClient::update`], and don't let the answer wait on any update of the game,
    /// eg. one made while answering a join, as it would wait until the start timed out. If a start
    /// fails, eg. it timed out or the service couldn't save it, the player can ask again, so answer
    /// a start of a game the bot has already started with its players as they are now.
    pub fn start(&self, x_oc_jwt: &str) -> Result<MiniAppPlayerClaims, TokenError> {
        self.verify(x_oc_jwt, MiniAppTokenType::Start)
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
    use oc_bots_sdk::types::{BlobReference, CallResult, Chat, MiniAppImage};
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
            .finished()
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

        // A bot can only finish a game, as a player starts it
        assert_eq!(
            serde_json::to_value(GameUpdate::new(game()).finished().with_result("Bob won"))
                .unwrap(),
            json!({ "game": game_json(), "status": "Finished", "result": "Bob won" })
        );
        assert!(serde_json::from_value::<GameStatus>(json!("Active")).is_err());
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

    #[test]
    fn a_start_is_answered_as_the_protocol_says() {
        let start = StartResponse::accept(
            vec![id(2), id(3)],
            vec![id(2)],
            GameState {
                seq: 1,
                shared: json!({ "version": 1 }),
                private: HashMap::from([(id(3), json!({ "hand": [5] }))]),
            },
        );
        assert_eq!(
            serde_json::to_value(&start).unwrap(),
            json!({
                "accepted": true,
                "players": [id(2).to_string(), id(3).to_string()],
                "waiting_for": [id(2).to_string()],
                "state": {
                    "seq": 1,
                    "shared": { "version": 1 },
                    "private": { id(3).to_string(): { "hand": [5] } },
                },
            })
        );
        let json = serde_json::to_string(&start).unwrap();
        assert_eq!(serde_json::from_str::<StartResponse>(&json).unwrap(), start);

        // Waiting for no one in particular is still sent
        let start = StartResponse::accept(
            vec![id(2)],
            Vec::new(),
            GameState {
                seq: 1,
                shared: json!({}),
                private: HashMap::new(),
            },
        );
        assert_eq!(
            serde_json::to_value(&start).unwrap()["waiting_for"],
            json!([])
        );

        assert_eq!(
            serde_json::to_value(StartResponse::refuse("Needs 2 players")).unwrap(),
            json!({ "accepted": false, "message": "Needs 2 players" })
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
        let calls: [(&str, Verify); 4] = [
            ("MiniAppJoin", MiniAppVerifier::join),
            ("MiniAppStart", MiniAppVerifier::start),
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
    async fn serve<B: Into<String> + Send + 'static>(
        responses: Vec<(u16, B)>,
    ) -> (String, Arc<Mutex<Vec<Request>>>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let recorded = requests.clone();

        tokio::spawn(async move {
            for (status, body) in responses {
                let body: String = body.into();
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
            (400, r#"{"error":"Only players can be waited for"}"#),
            (403, r#"{"error":"Not the bot's game"}"#),
            (404, r#"{"error":"Unknown game"}"#),
            (409, r#"{"error":"The game has finished"}"#),
            (413, "length limit exceeded"),
            (503, r#"{"error":"Unavailable"}"#),
        ])
        .await;
        let client = client(url, vec![bot_token("a", 3600)]);

        for expected in [
            MiniAppServiceError::Invalid("Only players can be waited for".to_string()),
            MiniAppServiceError::NotTheBotsGame("Not the bot's game".to_string()),
            MiniAppServiceError::UnknownGame("Unknown game".to_string()),
            MiniAppServiceError::Finished("The game has finished".to_string()),
            MiniAppServiceError::TooLarge("length limit exceeded".to_string()),
            MiniAppServiceError::Status(503, "Unavailable".to_string()),
        ] {
            assert_eq!(client.update(GameUpdate::new(game())).await, Err(expected));
        }
    }

    fn card() -> MiniAppContent {
        MiniAppContent::new("**Uno** · 2 to 4 players")
            .with_max_players(4)
            .with_spectators(true)
            .with_image(MiniAppImage {
                width: 600,
                height: 400,
                mime_type: "image/png".to_string(),
                blob_reference: BlobReference {
                    canister_id: Principal::from_slice(&[6]),
                    blob_id: u128::MAX,
                },
            })
    }

    fn posted_json() -> String {
        json!({ "game": game_json() }).to_string()
    }

    // As the service's `PostArgs` reads it: ids as text, and the blob id as a decimal string
    #[tokio::test]
    async fn posts_a_card_and_fetches_the_public_key() {
        let (url, requests) = serve(vec![
            (200, posted_json()),
            (200, "-----BEGIN PUBLIC KEY-----".to_string()),
        ])
        .await;
        let token = bot_token("a", 3600);
        let client = client(url, vec![token.clone()]);

        assert_eq!(
            client.post("post-token", card(), true, Some(3)).await,
            Ok(game())
        );
        assert_eq!(
            client.public_key().await,
            Ok("-----BEGIN PUBLIC KEY-----".to_string())
        );

        let requests = requests.lock().unwrap();
        assert_eq!(requests[0].line, "POST /bot/post HTTP/1.1");
        assert_eq!(requests[0].token, Some(token));
        assert_eq!(
            serde_json::from_str::<Value>(&requests[0].body).unwrap(),
            json!({
                "token": "post-token",
                "card": {
                    "text": "**Uno** · 2 to 4 players",
                    "image": {
                        "width": 600,
                        "height": 400,
                        "mime_type": "image/png",
                        "blob_reference": {
                            "canister_id": Principal::from_slice(&[6]).to_text(),
                            "blob_id": "340282366920938463463374607431768211455",
                        },
                    },
                    "max_players": 4,
                    "spectators": true,
                },
                "block_level_markdown": true,
                "replies_to": 3,
            })
        );
        assert_eq!(requests[1].line, "GET /public_key HTTP/1.1");
        assert_eq!(requests[1].token, None);
    }

    // The same token posts the same card, so a post which got no answer is sent again as it was
    #[tokio::test]
    async fn a_card_without_an_image_or_limit_is_posted_without_them_and_may_be_posted_again() {
        let (url, requests) = serve(vec![
            (503, r#"{"error":"Unavailable"}"#.to_string()),
            (200, posted_json()),
        ])
        .await;
        let client = client(url, vec![bot_token("a", 3600)]);
        let card = MiniAppContent::new("x");

        assert_eq!(
            client.post("post-token", card.clone(), false, None).await,
            Err(MiniAppServiceError::Status(503, "Unavailable".to_string()))
        );
        assert_eq!(
            client.post("post-token", card, false, None).await,
            Ok(game())
        );

        let requests = requests.lock().unwrap();
        assert_eq!(requests.len(), 2);
        for request in requests.iter() {
            assert_eq!(request.line, "POST /bot/post HTTP/1.1");
            assert_eq!(
                serde_json::from_str::<Value>(&request.body).unwrap(),
                json!({
                    "token": "post-token",
                    "card": { "text": "x", "spectators": false },
                    "block_level_markdown": false,
                    "replies_to": null,
                })
            );
        }
    }

    #[tokio::test]
    async fn gives_the_service_s_refusals_of_a_post() {
        let (url, _) = serve(vec![
            (400, r#"{"error":"Invalid post token"}"#),
            (403, r#"{"error":"Another bot's token"}"#),
            (409, r#"{"error":"The game has finished"}"#),
            (503, r#"{"error":"Unavailable"}"#),
            (200, "{}"),
        ])
        .await;
        let client = client(url, vec![bot_token("a", 3600)]);
        let post = || client.post("post-token", MiniAppContent::new("x"), false, None);

        for expected in [
            MiniAppServiceError::Invalid("Invalid post token".to_string()),
            MiniAppServiceError::NotTheBotsGame("Another bot's token".to_string()),
            MiniAppServiceError::Finished("The game has finished".to_string()),
            MiniAppServiceError::Status(503, "Unavailable".to_string()),
        ] {
            assert_eq!(post().await, Err(expected));
        }
        // An answer without the game in it can't be read
        let result = post().await;
        assert!(
            matches!(result, Err(MiniAppServiceError::Request(_))),
            "{result:?}"
        );
    }
}
