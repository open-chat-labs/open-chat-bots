use crate::config::OAuthConfig;
use crate::webhook::Discord;
use anyhow::{Context, Result, anyhow};
use axum::Router;
use axum::extract::{Query, State};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::get;
use oc_bots_sdk::types::{BridgedUser, DiscordUser};
use oc_bridge_core::Bridge;
use serde::Deserialize;
use std::sync::Arc;
use tracing::warn;
use url::Url;

/// Linking a Discord account to an OpenChat account. The user starts in their OpenChat profile,
/// which gives them a code and sends them to `/link?code=...`. That sends them through Discord's
/// OAuth, which tells the bridge whose account it is, and the bridge redeems the code for it.
pub fn router(bridge: Arc<Bridge<Discord>>, config: OAuthConfig) -> Router {
    Router::new()
        .route("/link", get(start))
        .route("/oauth/callback", get(callback))
        .with_state(Arc::new(OAuthState {
            bridge,
            redirect_uri: format!("{}/oauth/callback", config.public_url),
            config,
            http: reqwest::Client::new(),
        }))
}

struct OAuthState {
    bridge: Arc<Bridge<Discord>>,
    config: OAuthConfig,
    redirect_uri: String,
    http: reqwest::Client,
}

#[derive(Deserialize)]
struct StartParams {
    code: String,
}

// OpenChat's code goes through Discord's consent page as the `state`
async fn start(
    State(state): State<Arc<OAuthState>>,
    Query(params): Query<StartParams>,
) -> Response {
    let mut url = Url::parse("https://discord.com/oauth2/authorize").unwrap();
    url.query_pairs_mut()
        .append_pair("client_id", &state.config.client_id)
        .append_pair("response_type", "code")
        .append_pair("scope", "identify")
        .append_pair("redirect_uri", &state.redirect_uri)
        // Discord asks for consent every time, so a link someone else sent can't link an account
        // without its owner seeing which app it's for
        .append_pair("state", &params.code);
    Redirect::to(url.as_str()).into_response()
}

#[derive(Deserialize)]
struct CallbackParams {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

async fn callback(
    State(state): State<Arc<OAuthState>>,
    Query(params): Query<CallbackParams>,
) -> Html<String> {
    let result = async {
        if let Some(error) = params.error {
            return Err(anyhow!("Discord said: {error}"));
        }
        let discord_code = params.code.context("Discord didn't return a code")?;
        let openchat_code = params
            .state
            .context("The link is missing OpenChat's code")?;

        let user = discord_user(&state, &discord_code).await?;
        let username = user.username.clone();
        let linked = state
            .bridge
            .link(BridgedUser::Discord(user), openchat_code)
            .await?;
        Ok((username, linked.username))
    }
    .await;

    Html(match result {
        Ok((discord_username, openchat_username)) => page(&format!(
            "Your Discord account <b>{}</b> is now linked to <b>@{}</b> on OpenChat. You can close \
            this tab.",
            escape(&discord_username),
            escape(&openchat_username)
        )),
        Err(error) => {
            warn!(?error, "Failed to link a Discord account");
            page(&format!(
                "Your Discord account couldn't be linked: {}. Go back to OpenChat and try again.",
                escape(&error.to_string())
            ))
        }
    })
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct DiscordApiUser {
    id: String,
    username: String,
    global_name: Option<String>,
    avatar: Option<String>,
}

// Exchanges Discord's code for a token, then asks Discord whose account it is
async fn discord_user(state: &OAuthState, code: &str) -> Result<DiscordUser> {
    let token: TokenResponse = state
        .http
        .post("https://discord.com/api/v10/oauth2/token")
        .basic_auth(&state.config.client_id, Some(&state.config.client_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", &state.redirect_uri),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let user: DiscordApiUser = state
        .http
        .get("https://discord.com/api/v10/users/@me")
        .bearer_auth(&token.access_token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(DiscordUser {
        id: user.id.parse()?,
        username: user.username,
        display_name: user.global_name,
        avatar: user.avatar,
    })
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
