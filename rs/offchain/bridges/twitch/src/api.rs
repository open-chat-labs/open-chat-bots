use anyhow::{Context, Result, anyhow, bail};
use reqwest::{Method, Response, StatusCode};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::fmt::{Display, Formatter};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use url::Url;

const HELIX_URL: &str = "https://api.twitch.tv/helix";
const OAUTH_URL: &str = "https://id.twitch.tv/oauth2";
// The app access token is replaced this long before it expires
const TOKEN_REFRESH_MARGIN: Duration = Duration::from_secs(10 * 60);

/// Twitch refusing a call, with its HTTP status, eg. 403 when the bot can't post in a chat
#[derive(Debug)]
pub struct HelixError {
    pub status: u16,
    pub message: String,
}

impl Display for HelixError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "Twitch returned {}: {}", self.status, self.message)
    }
}

impl std::error::Error for HelixError {}

/// The status Twitch refused a call with, if it did
pub fn helix_status(error: &anyhow::Error) -> Option<u16> {
    error.downcast_ref::<HelixError>().map(|e| e.status)
}

/// The few Helix endpoints the bridge uses. All but `user_from_token` are called with the app's
/// access token, which acts for the bot and the broadcasters as far as they've authorized the app.
pub struct TwitchApi {
    http: reqwest::Client,
    pub client_id: String,
    client_secret: String,
    app_token: Mutex<Option<AppToken>>,
}

struct AppToken {
    access_token: String,
    refresh_at: Instant,
}

#[derive(Deserialize, Clone, Debug)]
pub struct User {
    pub id: String,
    pub login: String,
    pub display_name: String,
    #[serde(default)]
    pub profile_image_url: String,
}

#[derive(Deserialize, Debug)]
pub struct SentMessage {
    pub message_id: String,
    pub is_sent: bool,
    pub drop_reason: Option<DropReason>,
}

/// Why Twitch didn't post a message, eg. AutoMod held it, or the chat is in followers-only mode
#[derive(Deserialize, Debug)]
pub struct DropReason {
    pub code: String,
    pub message: String,
}

#[derive(Deserialize, Debug)]
pub struct Conduit {
    pub id: String,
    pub shard_count: u32,
}

#[derive(Deserialize, Debug)]
pub struct Subscription {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub condition: Value,
}

/// What a user signing in through Twitch's OAuth granted the bridge
#[derive(Deserialize, Debug)]
pub struct UserToken {
    pub access_token: String,
    // Left out, or null, when none were asked for
    #[serde(default)]
    scope: Option<Vec<String>>,
}

impl UserToken {
    pub fn has_scopes(&self, scopes: &[&str]) -> bool {
        let granted = self.scope.as_deref().unwrap_or_default();
        scopes.iter().all(|s| granted.iter().any(|g| g == s))
    }
}

#[derive(Deserialize)]
struct Data<T> {
    data: Vec<T>,
    #[serde(default)]
    pagination: Option<Pagination>,
}

#[derive(Deserialize)]
struct Pagination {
    cursor: Option<String>,
}

impl TwitchApi {
    pub fn new(client_id: String, client_secret: String) -> Self {
        TwitchApi {
            // With the rate limits' wait, well inside the 60 seconds OpenChat, or CloudFront before
            // the bridge, waits for an answer
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .expect("Failed to build an HTTP client"),
            client_id,
            client_secret,
            app_token: Mutex::default(),
        }
    }

    pub async fn users_by_id(&self, ids: &[&str]) -> Result<Vec<User>> {
        let query: Vec<_> = ids.iter().map(|id| ("id", *id)).collect();
        let users: Data<User> = self.helix(Method::GET, "/users", &query, None).await?;
        Ok(users.data)
    }

    pub async fn user_by_login(&self, login: &str) -> Result<Option<User>> {
        let users: Data<User> = self
            .helix(Method::GET, "/users", &[("login", login)], None)
            .await?;
        Ok(users.data.into_iter().next())
    }

    /// Posts in the broadcaster's chat as `sender_id`. A Shared Chat session's other channels don't
    /// see it, as only this one is bridged.
    pub async fn send_chat_message(
        &self,
        broadcaster_id: &str,
        sender_id: &str,
        message: &str,
        reply_to: Option<&str>,
    ) -> Result<SentMessage> {
        let mut body = json!({
            "broadcaster_id": broadcaster_id,
            "sender_id": sender_id,
            "message": message,
            "for_source_only": true,
        });
        if let Some(reply_to) = reply_to {
            body["reply_parent_message_id"] = json!(reply_to);
        }
        let sent: Data<SentMessage> = self
            .helix(Method::POST, "/chat/messages", &[], Some(&body))
            .await?;
        sent.data
            .into_iter()
            .next()
            .context("Twitch didn't return the message")
    }

    /// Only works where `moderator_id` is one of the broadcaster's moderators
    pub async fn delete_chat_message(
        &self,
        broadcaster_id: &str,
        moderator_id: &str,
        message_id: &str,
    ) -> Result<()> {
        let query = [
            ("broadcaster_id", broadcaster_id),
            ("moderator_id", moderator_id),
            ("message_id", message_id),
        ];
        self.helix_call(Method::DELETE, "/moderation/chat", &query, None)
            .await
            .map(|_| ())
    }

    pub async fn conduits(&self) -> Result<Vec<Conduit>> {
        let conduits: Data<Conduit> = self
            .helix(Method::GET, "/eventsub/conduits", &[], None)
            .await?;
        Ok(conduits.data)
    }

    pub async fn create_conduit(&self, shard_count: u32) -> Result<Conduit> {
        let body = json!({ "shard_count": shard_count });
        let conduits: Data<Conduit> = self
            .helix(Method::POST, "/eventsub/conduits", &[], Some(&body))
            .await?;
        conduits
            .data
            .into_iter()
            .next()
            .context("Twitch didn't return the conduit")
    }

    pub async fn set_shard_count(&self, conduit_id: &str, shard_count: u32) -> Result<()> {
        let body = json!({ "id": conduit_id, "shard_count": shard_count });
        self.helix_call(Method::PATCH, "/eventsub/conduits", &[], Some(&body))
            .await
            .map(|_| ())
    }

    /// Sends the conduit's events to the WebSocket session, as its only shard
    pub async fn assign_shard(&self, conduit_id: &str, session_id: &str) -> Result<()> {
        #[derive(Deserialize)]
        struct Response {
            #[serde(default)]
            errors: Vec<Value>,
        }

        let body = json!({
            "conduit_id": conduit_id,
            "shards": [{
                "id": "0",
                "transport": { "method": "websocket", "session_id": session_id },
            }],
        });
        let response: Response = self
            .helix(Method::PATCH, "/eventsub/conduits/shards", &[], Some(&body))
            .await?;
        match response.errors.first() {
            Some(error) => bail!("Twitch didn't assign the shard: {error}"),
            None => Ok(()),
        }
    }

    /// Subscribes the conduit to an event. One which exists already is left as it is.
    pub async fn subscribe(&self, kind: &str, condition: Value, conduit_id: &str) -> Result<()> {
        let body = json!({
            "type": kind,
            "version": "1",
            "condition": condition,
            "transport": { "method": "conduit", "conduit_id": conduit_id },
        });
        match self
            .helix_call(Method::POST, "/eventsub/subscriptions", &[], Some(&body))
            .await
        {
            Err(error) if helix_status(&error) == Some(409) => Ok(()),
            result => result.map(|_| ()),
        }
    }

    /// The app's subscriptions whose condition names the user, eg. as the broadcaster
    pub async fn subscriptions_for_user(&self, user_id: &str) -> Result<Vec<Subscription>> {
        let mut subscriptions = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let mut query = vec![("user_id", user_id)];
            if let Some(cursor) = &cursor {
                query.push(("after", cursor));
            }
            let page: Data<Subscription> = self
                .helix(Method::GET, "/eventsub/subscriptions", &query, None)
                .await?;
            subscriptions.extend(page.data);
            cursor = page
                .pagination
                .and_then(|p| p.cursor)
                .filter(|c| !c.is_empty());
            if cursor.is_none() {
                return Ok(subscriptions);
            }
        }
    }

    pub async fn unsubscribe(&self, subscription_id: &str) -> Result<()> {
        match self
            .helix_call(
                Method::DELETE,
                "/eventsub/subscriptions",
                &[("id", subscription_id)],
                None,
            )
            .await
        {
            Err(error) if helix_status(&error) == Some(404) => Ok(()),
            result => result.map(|_| ()),
        }
    }

    /// Where to send a user to sign in with Twitch and grant `scopes`. Twitch asks for consent every
    /// time, so a link someone else sent can't act for a user without them seeing which app it's
    /// for.
    pub fn authorize_url(&self, redirect_uri: &str, scopes: &[&str], state: &str) -> String {
        let mut url = Url::parse(&format!("{OAUTH_URL}/authorize")).unwrap();
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("scope", &scopes.join(" "))
            .append_pair("state", state)
            .append_pair("force_verify", "true");
        url.into()
    }

    /// Exchanges the code Twitch's OAuth returned for the user's token
    pub async fn exchange_code(&self, code: &str, redirect_uri: &str) -> Result<UserToken> {
        self.oauth_token(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ])
        .await
    }

    /// Who signed in, with the token they granted
    pub async fn user_from_token(&self, access_token: &str) -> Result<User> {
        let response = self
            .http
            .get(format!("{HELIX_URL}/users"))
            .bearer_auth(access_token)
            .header("Client-Id", &self.client_id)
            .send()
            .await
            .map_err(|e| anyhow!("Twitch's /users failed: {e}"))?;
        let users: Data<User> = serde_json::from_slice(&body(response).await?)?;
        users
            .data
            .into_iter()
            .next()
            .context("Twitch didn't say who signed in")
    }

    async fn helix<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        body: Option<&Value>,
    ) -> Result<T> {
        let bytes = self.helix_call(method, path, query, body).await?;
        serde_json::from_slice(&bytes).map_err(|e| anyhow!("Twitch's {path} returned {e}"))
    }

    // With the app's token. One Twitch no longer accepts is replaced, and the call made again.
    async fn helix_call(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        json: Option<&Value>,
    ) -> Result<Vec<u8>> {
        let mut response = self.send_helix(&method, path, query, json).await?;
        if response.status() == StatusCode::UNAUTHORIZED {
            *self.app_token.lock().await = None;
            response = self.send_helix(&method, path, query, json).await?;
        }
        body(response).await
    }

    async fn send_helix(
        &self,
        method: &Method,
        path: &str,
        query: &[(&str, &str)],
        json: Option<&Value>,
    ) -> Result<Response> {
        let token = self.app_token().await?;
        let mut request = self
            .http
            .request(method.clone(), format!("{HELIX_URL}{path}"))
            .query(query)
            .bearer_auth(token)
            .header("Client-Id", &self.client_id);
        if let Some(json) = json {
            request = request.json(json);
        }
        request
            .send()
            .await
            .map_err(|e| anyhow!("Twitch's {path} failed: {e}"))
    }

    // From the app's client id and secret. It lasts about two months.
    async fn app_token(&self) -> Result<String> {
        #[derive(Deserialize)]
        struct Token {
            access_token: String,
            expires_in: u64,
        }

        let mut app_token = self.app_token.lock().await;
        if let Some(token) = app_token.as_ref().filter(|t| Instant::now() < t.refresh_at) {
            return Ok(token.access_token.clone());
        }
        let token: Token = self
            .oauth_token(&[("grant_type", "client_credentials")])
            .await?;
        *app_token = Some(AppToken {
            access_token: token.access_token.clone(),
            refresh_at: Instant::now()
                + Duration::from_secs(token.expires_in).saturating_sub(TOKEN_REFRESH_MARGIN),
        });
        Ok(token.access_token)
    }

    async fn oauth_token<T: DeserializeOwned>(&self, params: &[(&str, &str)]) -> Result<T> {
        let mut form = vec![
            ("client_id", self.client_id.as_str()),
            ("client_secret", self.client_secret.as_str()),
        ];
        form.extend_from_slice(params);
        let response = self
            .http
            .post(format!("{OAUTH_URL}/token"))
            .form(&form)
            .send()
            .await
            .map_err(|e| anyhow!("Twitch's OAuth failed: {e}"))?;
        Ok(serde_json::from_slice(&body(response).await?)?)
    }
}

// The response's body, or a `HelixError` with the message Twitch gave
async fn body(response: Response) -> Result<Vec<u8>> {
    #[derive(Deserialize)]
    struct ErrorBody {
        message: Option<String>,
    }

    let status = response.status();
    let bytes = response.bytes().await?.to_vec();
    if status.is_success() {
        return Ok(bytes);
    }
    let message = serde_json::from_slice::<ErrorBody>(&bytes)
        .ok()
        .and_then(|b| b.message)
        .unwrap_or_else(|| String::from_utf8_lossy(&bytes).into_owned());
    Err(HelixError {
        status: status.as_u16(),
        message,
    }
    .into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_authorize_url_asks_for_consent_every_time() {
        let api = TwitchApi::new("abc".to_string(), "secret".to_string());
        let url = api.authorize_url(
            "https://bridge.example.com/oauth/callback",
            &["user:bot", "user:read:chat"],
            "link:XYZ",
        );
        assert_eq!(
            url,
            "https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=abc&redirect_uri=\
            https%3A%2F%2Fbridge.example.com%2Foauth%2Fcallback&scope=user%3Abot+user%3Aread%3Achat\
            &state=link%3AXYZ&force_verify=true"
        );
    }

    #[test]
    fn a_tokens_scopes_are_read() {
        let token: UserToken = serde_json::from_str(
            r#"{"access_token":"x","expires_in":14000,"refresh_token":"y","scope":["channel:bot"],"token_type":"bearer"}"#,
        )
        .unwrap();
        assert!(token.has_scopes(&["channel:bot"]));
        assert!(!token.has_scopes(&["channel:bot", "user:bot"]));
        // None asked for
        for json in [
            r#"{"access_token":"x","token_type":"bearer"}"#,
            r#"{"access_token":"x","scope":null,"token_type":"bearer"}"#,
        ] {
            let token: UserToken = serde_json::from_str(json).unwrap();
            assert!(token.has_scopes(&[]));
            assert!(!token.has_scopes(&["channel:bot"]));
        }
    }

    #[test]
    fn a_dropped_message_says_why() {
        let sent: Data<SentMessage> = serde_json::from_str(
            r#"{"data":[{"message_id":"","is_sent":false,"drop_reason":{"code":"msg_duplicate","message":"Your message is identical to the one you sent within the last 30 seconds."}}]}"#,
        )
        .unwrap();
        let sent = &sent.data[0];
        assert!(!sent.is_sent);
        assert_eq!(sent.drop_reason.as_ref().unwrap().code, "msg_duplicate");
    }
}
