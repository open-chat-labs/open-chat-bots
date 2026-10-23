//! Receives paired channels' chat events from Twitch's EventSub. The bridge's subscriptions belong
//! to a conduit, whose one shard is the bridge's WebSocket. They're the conduit's, so they survive
//! the WebSocket reconnecting and the bridge restarting, and each new WebSocket only has to be made
//! the shard.

use crate::api::TwitchApi;
use crate::chat::ChatHandler;
use anyhow::{Context, Result, anyhow, bail};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::sync::Semaphore;
use tokio::time::{Instant, timeout};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};
use tracing::{info, warn};

// Twitch sends a keepalive when it has sent nothing else for this long
const EVENTSUB_URL: &str = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
// Twitch closes a WebSocket which isn't made a shard within 10 seconds of its welcome
const WELCOME_TIMEOUT: Duration = Duration::from_secs(10);
// Beyond the keepalive Twitch promises, before the connection's taken to be lost
const KEEPALIVE_MARGIN: Duration = Duration::from_secs(5);
// How many events are relayed at once. Relaying one into OpenChat takes a few seconds, and a busy
// chat sends more than that.
const MAX_CONCURRENT_EVENTS: usize = 32;
// A connection which lasted this long was healthy, so the next one is tried at once
const HEALTHY_CONNECTION: Duration = Duration::from_secs(60);
const MAX_RECONNECT_DELAY: Duration = Duration::from_secs(60);

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// The app's conduit, created with one shard if the app has none
pub async fn conduit(api: &TwitchApi) -> Result<String> {
    let conduit = match api.conduits().await?.into_iter().next() {
        Some(conduit) => conduit,
        None => {
            let conduit = api.create_conduit(1).await?;
            // Twitch deletes a conduit with no shard connected for 72 hours, with its
            // subscriptions. Each paired channel's are made again when OpenChat next relays to it.
            warn!(
                conduit = conduit.id,
                "Created a conduit, as the app had none"
            );
            conduit
        }
    };
    // Every event goes to the bridge's one WebSocket
    if conduit.shard_count != 1 {
        api.set_shard_count(&conduit.id, 1).await?;
    }
    Ok(conduit.id)
}

/// Relays the conduit's events to `handler` until the process exits, reconnecting whenever the
/// connection's lost
pub async fn run(api: Arc<TwitchApi>, conduit_id: String, handler: Arc<ChatHandler>) -> Result<()> {
    let receiver = Receiver {
        api,
        conduit_id,
        handler,
        semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_EVENTS)),
    };
    let mut delay = Duration::ZERO;
    loop {
        let started = Instant::now();
        let error = receiver.receive().await;
        if started.elapsed() >= HEALTHY_CONNECTION {
            delay = Duration::ZERO;
        }
        warn!(?error, ?delay, "Lost the connection to Twitch's EventSub");
        tokio::time::sleep(delay).await;
        delay = (delay * 2)
            .max(Duration::from_secs(1))
            .min(MAX_RECONNECT_DELAY);
    }
}

struct Receiver {
    api: Arc<TwitchApi>,
    conduit_id: String,
    handler: Arc<ChatHandler>,
    semaphore: Arc<Semaphore>,
}

struct Session {
    socket: Socket,
    id: String,
    keepalive: Duration,
}

impl Receiver {
    // Until the connection's lost
    async fn receive(&self) -> anyhow::Error {
        let mut session = match self.connect(EVENTSUB_URL).await {
            Ok(session) => session,
            Err(error) => return error,
        };
        info!(session = session.id, "Receiving Twitch's events");
        loop {
            let frame = match timeout(session.keepalive, next_frame(&mut session.socket)).await {
                Ok(Ok(frame)) => frame,
                Ok(Err(error)) => return error,
                Err(_) => return anyhow!("Twitch sent nothing for longer than its keepalive"),
            };
            match frame.metadata.message_type.as_str() {
                "notification" | "revocation" => self.dispatch(frame),
                // Twitch is moving the connection. The old one receives events until the new one's
                // welcome, so they're relayed before it's closed.
                "session_reconnect" => {
                    let url = frame.payload.session.and_then(|s| s.reconnect_url);
                    let Some(url) = url else {
                        return anyhow!("Twitch asked to reconnect without saying where");
                    };
                    let new = match self.connect(&url).await {
                        Ok(new) => new,
                        Err(error) => return error,
                    };
                    self.drain(session.socket).await;
                    info!(session = new.id, "Moved to a new EventSub connection");
                    session = new;
                }
                _ => {}
            }
        }
    }

    // Connects, then makes the WebSocket the conduit's shard
    async fn connect(&self, url: &str) -> Result<Session> {
        let (mut socket, _) = connect_async(url)
            .await
            .context("Failed to connect to Twitch's EventSub")?;
        let welcome = timeout(WELCOME_TIMEOUT, next_frame(&mut socket))
            .await
            .context("Twitch sent no welcome")??;
        let session = welcome
            .payload
            .session
            .filter(|_| welcome.metadata.message_type == "session_welcome")
            .context("Twitch's first message wasn't a welcome")?;
        self.api.assign_shard(&self.conduit_id, &session.id).await?;
        Ok(Session {
            socket,
            id: session.id,
            keepalive: Duration::from_secs(session.keepalive_timeout_seconds.unwrap_or(10))
                + KEEPALIVE_MARGIN,
        })
    }

    // Relays what the old connection received before the new one took over, then closes it
    async fn drain(&self, mut socket: Socket) {
        while let Ok(Ok(frame)) = timeout(Duration::from_secs(1), next_frame(&mut socket)).await {
            if matches!(
                frame.metadata.message_type.as_str(),
                "notification" | "revocation"
            ) {
                self.dispatch(frame);
            }
        }
        let _ = socket.close(None).await;
    }

    // Relayed alongside others, so a busy chat doesn't hold up every other. Several messages sent
    // within a moment of each other can arrive in OpenChat out of order.
    fn dispatch(&self, frame: Frame) {
        let Some(subscription) = frame.payload.subscription else {
            return;
        };
        let event = frame.payload.event;
        let revoked = frame.metadata.message_type == "revocation";
        let handler = self.handler.clone();
        let semaphore = self.semaphore.clone();
        tokio::spawn(async move {
            let _permit = semaphore.acquire_owned().await;
            let result = match (revoked, event) {
                (true, _) => {
                    handler
                        .revoked(
                            &subscription.kind,
                            &subscription.condition,
                            &subscription.status,
                        )
                        .await
                }
                (false, Some(event)) => handler.handle(&subscription.kind, event).await,
                (false, None) => Ok(()),
            };
            if let Err(error) = result {
                warn!(
                    ?error,
                    kind = subscription.kind,
                    "Failed to relay a Twitch event"
                );
            }
        });
    }
}

#[derive(Deserialize, Debug)]
struct Frame {
    metadata: Metadata,
    #[serde(default)]
    payload: Payload,
}

#[derive(Deserialize, Debug)]
struct Metadata {
    message_type: String,
}

#[derive(Deserialize, Debug, Default)]
struct Payload {
    session: Option<SessionInfo>,
    subscription: Option<SubscriptionInfo>,
    event: Option<Value>,
}

#[derive(Deserialize, Debug)]
struct SessionInfo {
    id: String,
    keepalive_timeout_seconds: Option<u64>,
    reconnect_url: Option<String>,
}

#[derive(Deserialize, Debug)]
struct SubscriptionInfo {
    #[serde(rename = "type")]
    kind: String,
    status: String,
    #[serde(default)]
    condition: Value,
}

// The next of Twitch's messages. Reading answers Twitch's pings.
async fn next_frame(socket: &mut Socket) -> Result<Frame> {
    loop {
        match socket.next().await {
            Some(Ok(Message::Text(text))) => {
                return serde_json::from_str(&text)
                    .with_context(|| format!("Twitch sent an unexpected message: {text}"));
            }
            Some(Ok(Message::Close(frame))) => bail!("Twitch closed the connection: {frame:?}"),
            Some(Ok(_)) => {}
            Some(Err(error)) => return Err(error.into()),
            None => bail!("The connection closed"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_welcome_gives_the_session() {
        let frame: Frame = serde_json::from_str(
            r#"{"metadata":{"message_id":"96a3f3b5","message_type":"session_welcome","message_timestamp":"2023-07-19T14:56:51.634234626Z"},
            "payload":{"session":{"id":"AQoQILE98gtqShGmLD7AM6yJThAB","status":"connected","connected_at":"2023-07-19T14:56:51.616329898Z","keepalive_timeout_seconds":30,"reconnect_url":null}}}"#,
        )
        .unwrap();
        let session = frame.payload.session.unwrap();
        assert_eq!(session.id, "AQoQILE98gtqShGmLD7AM6yJThAB");
        assert_eq!(session.keepalive_timeout_seconds, Some(30));
    }

    #[test]
    fn a_keepalive_has_an_empty_payload() {
        let frame: Frame = serde_json::from_str(
            r#"{"metadata":{"message_id":"84c1e79a","message_type":"session_keepalive","message_timestamp":"2023-07-19T10:11:12.634234626Z"},"payload":{}}"#,
        )
        .unwrap();
        assert_eq!(frame.metadata.message_type, "session_keepalive");
        assert!(frame.payload.subscription.is_none());
    }

    #[test]
    fn a_revocation_says_whose_subscription() {
        let frame: Frame = serde_json::from_str(
            r#"{"metadata":{"message_id":"84c1e79a","message_type":"revocation","message_timestamp":"2022-11-16T10:11:12.464757833Z","subscription_type":"channel.chat.message","subscription_version":"1"},
            "payload":{"subscription":{"id":"f1c2a387","status":"authorization_revoked","type":"channel.chat.message","version":"1","cost":0,
            "condition":{"broadcaster_user_id":"1971641","user_id":"999"},"transport":{"method":"conduit","conduit_id":"bfcfc993"},"created_at":"2022-11-16T10:11:12.464757833Z"}}}"#,
        )
        .unwrap();
        let subscription = frame.payload.subscription.unwrap();
        assert_eq!(subscription.kind, "channel.chat.message");
        assert_eq!(subscription.status, "authorization_revoked");
        assert_eq!(subscription.condition["broadcaster_user_id"], "1971641");
        assert!(frame.payload.event.is_none());
    }
}
