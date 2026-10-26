//! What users do through Twitch's OAuth, which tells the bridge whose account it is:
//! - **`/link?code=...`:** linking a Twitch account to an OpenChat account. The user starts in their
//!   OpenChat profile, which gives them a code and sends them here. The bridge redeems the code for
//!   the Twitch account they sign in with.
//! - **`/bridge`:** a broadcaster letting the bot into their chat, with `channel:bot`, and getting a
//!   code to bridge it with an OpenChat chat.
//! - **`/authorize-bot`:** the bot's account letting the app chat as it, once, when the bridge is
//!   set up.

use crate::api::{User, UserToken};
use crate::chat::twitch_user;
use crate::platform::Twitch;
use crate::profiles::profile_image_path;
use anyhow::{Context, Result, anyhow, bail};
use axum::Router;
use axum::extract::{Query, State};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::get;
use oc_bots_sdk::types::BridgedUser;
use oc_bridge_core::{Bridge, PendingPairing};
use serde::Deserialize;
use std::sync::Arc;
use tracing::warn;

/// What the broadcaster grants, so the bot can read and post in their chat, with the Chat Bot badge
pub const BROADCASTER_SCOPES: [&str; 1] = ["channel:bot"];
/// What the bot's account grants, so the app can read and post in chats as it, delete messages
/// where it's a moderator, and whisper, eg. to tell an author of a tip OpenChat holds for them
pub const BOT_SCOPES: [&str; 5] = [
    "user:bot",
    "user:read:chat",
    "user:write:chat",
    "moderator:manage:chat_messages",
    "user:manage:whispers",
];

pub fn router(bridge: Arc<Bridge<Twitch>>) -> Router {
    let redirect_uri = format!("{}/oauth/callback", bridge.platform.public_url);
    Router::new()
        .route("/link", get(link))
        .route("/bridge", get(bridge_chat))
        .route("/authorize-bot", get(authorize_bot))
        .route("/oauth/callback", get(callback))
        .with_state(Arc::new(OAuthState {
            bridge,
            redirect_uri,
        }))
}

struct OAuthState {
    bridge: Arc<Bridge<Twitch>>,
    redirect_uri: String,
}

/// What a user is signing in with Twitch for, which goes through Twitch's OAuth as the `state`
#[derive(Debug, PartialEq)]
enum Purpose {
    /// With OpenChat's code
    Link(String),
    Bridge,
    AuthorizeBot,
}

impl Purpose {
    fn state(&self) -> String {
        match self {
            Purpose::Link(code) => format!("link:{code}"),
            Purpose::Bridge => "bridge".to_string(),
            Purpose::AuthorizeBot => "bot".to_string(),
        }
    }

    fn from_state(state: &str) -> Option<Self> {
        match state {
            "bridge" => Some(Purpose::Bridge),
            "bot" => Some(Purpose::AuthorizeBot),
            _ => state
                .strip_prefix("link:")
                .filter(|code| !code.is_empty())
                .map(|code| Purpose::Link(code.to_string())),
        }
    }

    fn scopes(&self) -> &'static [&'static str] {
        match self {
            // Only who they are
            Purpose::Link(_) => &[],
            Purpose::Bridge => &BROADCASTER_SCOPES,
            Purpose::AuthorizeBot => &BOT_SCOPES,
        }
    }
}

#[derive(Deserialize)]
struct LinkParams {
    code: String,
}

async fn link(State(state): State<Arc<OAuthState>>, Query(params): Query<LinkParams>) -> Response {
    sign_in(&state, Purpose::Link(params.code))
}

async fn bridge_chat(State(state): State<Arc<OAuthState>>) -> Response {
    sign_in(&state, Purpose::Bridge)
}

async fn authorize_bot(State(state): State<Arc<OAuthState>>) -> Response {
    sign_in(&state, Purpose::AuthorizeBot)
}

fn sign_in(state: &OAuthState, purpose: Purpose) -> Response {
    let url = state.bridge.platform.api.authorize_url(
        &state.redirect_uri,
        purpose.scopes(),
        &purpose.state(),
    );
    Redirect::to(&url).into_response()
}

#[derive(Deserialize)]
struct CallbackParams {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

async fn callback(
    State(state): State<Arc<OAuthState>>,
    Query(params): Query<CallbackParams>,
) -> Html<String> {
    let purpose = params.state.as_deref().and_then(Purpose::from_state);
    let result = async {
        if let Some(error) = params.error {
            bail!("Twitch said: {}", params.error_description.unwrap_or(error));
        }
        let purpose = purpose
            .as_ref()
            .context("The link is missing what it's for")?;
        let code = params.code.context("Twitch didn't return a code")?;
        let api = &state.bridge.platform.api;
        let token = api.exchange_code(&code, &state.redirect_uri).await?;
        if !token.has_scopes(purpose.scopes()) {
            bail!("Twitch didn't grant everything the bridge asked for");
        }
        let user = api.user_from_token(&token.access_token).await?;
        match purpose {
            Purpose::Link(code) => link_account(&state.bridge, user, code.clone()).await,
            Purpose::Bridge => start_bridging(&state.bridge, user).await,
            Purpose::AuthorizeBot => bot_authorized(&state.bridge.platform, &user, token).await,
        }
    }
    .await;

    Html(page(&match result {
        Ok(html) => html,
        Err(error) => {
            warn!(?error, ?purpose, "Failed to complete a Twitch sign-in");
            let error = escape(&error.to_string());
            match purpose {
                Some(Purpose::Link(_)) => format!(
                    "Your Twitch account couldn't be linked: {error}. Go back to OpenChat and try \
                    again."
                ),
                Some(Purpose::Bridge) => {
                    format!("Your chat couldn't be bridged: {error}. Please try again.")
                }
                _ => format!("Something went wrong: {error}."),
            }
        }
    }))
}

async fn link_account(bridge: &Bridge<Twitch>, user: User, code: String) -> Result<String> {
    let login = user.login.clone();
    let linked = bridge.link(bridged_user(user)?, code).await?;
    Ok(format!(
        "Your Twitch account <b>{}</b> is now linked to <b>@{}</b> on OpenChat. You can close this \
        tab.",
        escape(&login),
        escape(&linked.username)
    ))
}

// The bot joins the chat now, so any problem with that shows before the broadcaster has a code
async fn start_bridging(bridge: &Bridge<Twitch>, user: User) -> Result<String> {
    let platform = &bridge.platform;
    platform
        .subscribe(&user.id)
        .await
        .map_err(|error| anyhow!("the bot couldn't join your chat ({error})"))?;
    let pending = PendingPairing {
        platform_chat: user.id.clone(),
        name: format!("{}'s chat", user.display_name),
        platform_data: None,
    };
    let code = bridge.start_pairing(&pending).await?;
    let bot = escape(&platform.bot_login);
    Ok(format!(
        "To bridge your Twitch chat with OpenChat, install the bridge bot in the OpenChat group or \
        public channel to bridge with, then run <code>/bridge {code}</code> there within 15 \
        minutes.</p><p>Make <b>{bot}</b> a moderator in your chat, with <code>/mod {bot}</code>, \
        so it can relay more messages, and delete there what's deleted in OpenChat.</p><p>To stop \
        bridging, run <code>!unbridge</code> in your chat, or <code>/unbridge</code> in OpenChat."
    ))
}

// The bot's token is kept, as whispers need it
async fn bot_authorized(platform: &Twitch, user: &User, token: UserToken) -> Result<String> {
    if user.id != platform.bot_id {
        bail!(
            "sign in as {}, the bot's account, not {}",
            platform.bot_login,
            user.login
        );
    }
    platform.bot_token.save(token).await?;
    Ok(format!(
        "The bridge can now chat as <b>{}</b>. You can close this tab.",
        escape(&user.login)
    ))
}

fn bridged_user(user: User) -> Result<BridgedUser> {
    twitch_user(
        &user.id,
        &user.login,
        &user.display_name,
        profile_image_path(&user.profile_image_url),
    )
}

fn page(message: &str) -> String {
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" \
        content=\"width=device-width, initial-scale=1\"><title>OpenChat</title></head>\
        <body style=\"font-family: sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem\">\
        <p>{message}</p></body></html>"
    )
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::TwitchApi;
    use axum::body::Body;
    use axum::http::{Request, StatusCode, header};
    use ic_agent::identity::AnonymousIdentity;
    use oc_bots_sdk::types::{BridgePlatform, TwitchUser};
    use oc_bridge_core::{BridgeStore, InMemoryStore, OpenChat, OpenChatConfig};
    use tower::ServiceExt;

    async fn router() -> Router {
        let openchat = OpenChat::with_identity(
            OpenChatConfig::mainnet(String::new()),
            Box::new(AnonymousIdentity),
        )
        .await
        .unwrap();
        let api = Arc::new(TwitchApi::new("abc".to_string(), "secret".to_string()));
        let store = BridgeStore::new(Arc::new(InMemoryStore::default()), BridgePlatform::Twitch);
        let platform = Twitch::new(
            api,
            "999".to_string(),
            "ocbridge".to_string(),
            "https://bridge.example.com".to_string(),
            "conduit".to_string(),
            store.clone(),
        );
        let bridge = Arc::new(Bridge::new(openchat, store, platform));
        // Its OpenChat runtime can't be dropped within async code
        std::mem::forget(bridge.clone());
        super::router(bridge)
    }

    async fn get(path: &str) -> axum::response::Response {
        router()
            .await
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn each_start_signs_in_with_twitch_for_what_it_needs() {
        for (path, scope, state) in [
            ("/link?code=ABC123", "scope=&", "state=link%3AABC123"),
            ("/bridge", "scope=channel%3Abot&", "state=bridge"),
            (
                "/authorize-bot",
                "scope=user%3Abot+user%3Aread%3Achat+user%3Awrite%3Achat+moderator%3Amanage%3Achat_messages+user%3Amanage%3Awhispers&",
                "state=bot",
            ),
        ] {
            let response = get(path).await;
            assert_eq!(response.status(), StatusCode::SEE_OTHER, "{path}");
            let location = response.headers()[header::LOCATION].to_str().unwrap();
            assert!(location.starts_with("https://id.twitch.tv/oauth2/authorize?"));
            assert!(
                location
                    .contains("redirect_uri=https%3A%2F%2Fbridge.example.com%2Foauth%2Fcallback")
            );
            assert!(location.contains(scope), "{location}");
            assert!(location.contains(state), "{location}");
        }
    }

    #[tokio::test]
    async fn a_refused_sign_in_says_what_failed() {
        let response = get(
            "/oauth/callback?error=access_denied&error_description=The+user+denied+you+access&state=link%3AABC123",
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert!(String::from_utf8_lossy(&body).contains(
            "Your Twitch account couldn't be linked: Twitch said: The user denied you access."
        ));
    }

    #[test]
    fn the_purpose_survives_twitchs_oauth() {
        for purpose in [
            Purpose::Link("ABCD1234".to_string()),
            Purpose::Bridge,
            Purpose::AuthorizeBot,
        ] {
            assert_eq!(Purpose::from_state(&purpose.state()), Some(purpose));
        }
        assert_eq!(Purpose::from_state("link:"), None);
        assert_eq!(Purpose::from_state("other"), None);
    }

    #[test]
    fn a_linked_account_has_its_profile() {
        let user = User {
            id: "141981764".to_string(),
            login: "nelly".to_string(),
            display_name: "Nelly".to_string(),
            profile_image_url:
                "https://static-cdn.jtvnw.net/jtv_user_pictures/abc-profile_image-300x300.png"
                    .to_string(),
        };
        assert_eq!(
            bridged_user(user).unwrap(),
            BridgedUser::Twitch(TwitchUser {
                id: 141981764,
                login: "nelly".to_string(),
                display_name: "Nelly".to_string(),
                profile_image: Some("jtv_user_pictures/abc-profile_image-300x300.png".to_string()),
            })
        );
    }
}
