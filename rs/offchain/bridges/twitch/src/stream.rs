//! Tells a paired channel's OpenChat chat when the channel goes live, with its link, so members can
//! watch from there. Going offline isn't announced, to keep the chat quiet.

use crate::platform::Twitch;
use anyhow::Result;
use oc_bots_sdk::types::MessageId;
use oc_bridge_core::Bridge;
use oc_bridge_core::util::{inbound_message_id, without_mention_everyone};
use serde::Deserialize;
use tracing::warn;

/// `stream.online`
#[derive(Deserialize, Debug)]
pub struct StreamOnlineEvent {
    /// The stream's
    pub id: String,
    pub broadcaster_user_id: String,
    pub broadcaster_user_login: String,
    /// The broadcaster's display name
    pub broadcaster_user_name: String,
    /// "live", or one of the kinds Twitch no longer makes, eg. "rerun"
    #[serde(rename = "type", default)]
    pub kind: Option<String>,
}

impl StreamOnlineEvent {
    /// Unless Twitch says it's another kind, eg. a rerun
    pub fn is_live(&self) -> bool {
        self.kind.as_deref().is_none_or(|kind| kind == "live")
    }
}

/// Tells the OpenChat chat the channel's paired with, if any, that the channel's live
pub async fn online(bridge: &Bridge<Twitch>, event: StreamOnlineEvent) -> Result<()> {
    if !event.is_live() {
        return Ok(());
    }
    let channel = &event.broadcaster_user_id;
    let Some(pairing) = bridge.store.pairing(channel).await? else {
        return Ok(());
    };
    // The event doesn't have it. The notice is still worth posting without it.
    let title = match bridge.platform.api.channel_title(channel).await {
        Ok(title) => title,
        Err(error) => {
            warn!(%error, channel, "Failed to look up a stream's title");
            None
        }
    };
    bridge
        .openchat
        .send_notice_with_id(
            &pairing,
            notice_id(&event),
            live_text(&event, title.as_deref()),
        )
        .await
}

/// Derived from the stream, as Twitch can send the event twice, and OpenChat doesn't post a message
/// whose id the chat has already. So each stream is announced once.
pub fn notice_id(event: &StreamOnlineEvent) -> MessageId {
    inbound_message_id(
        &event.broadcaster_user_id,
        &format!("stream.online/{}", event.id),
    )
}

/// eg. "Nelly is live on Twitch: Speedrunning Celeste", then the channel's link on its own line
pub fn live_text(event: &StreamOnlineEvent, title: Option<&str>) -> String {
    let login = event.broadcaster_user_login.to_lowercase();
    let name = match event.broadcaster_user_name.trim() {
        "" => login.as_str(),
        name => name,
    };
    let url = format!("https://www.twitch.tv/{login}");
    let text = match title.map(str::trim).filter(|title| !title.is_empty()) {
        Some(title) => format!("{name} is live on Twitch: {title}\n{url}"),
        None => format!("{name} is live on Twitch\n{url}"),
    };
    // The broadcaster chooses the title, so it can't mention everyone in OpenChat
    without_mention_everyone(&text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn event(value: Value) -> StreamOnlineEvent {
        let mut event = json!({
            "id": "9001",
            "broadcaster_user_id": "1337",
            "broadcaster_user_login": "nelly",
            "broadcaster_user_name": "Nelly",
            "type": "live",
            "started_at": "2020-10-11T10:11:12.123Z",
        });
        for (key, value) in value.as_object().unwrap() {
            event[key] = value.clone();
        }
        serde_json::from_value(event).unwrap()
    }

    #[test]
    fn the_event_says_whose_stream_it_is() {
        let online = event(json!({}));
        assert_eq!(online.id, "9001");
        assert_eq!(online.broadcaster_user_id, "1337");
        assert_eq!(online.broadcaster_user_login, "nelly");
        assert_eq!(online.broadcaster_user_name, "Nelly");
        assert!(online.is_live());
        assert!(!event(json!({ "type": "rerun" })).is_live());

        // In case Twitch stops sending it, as "live" is the only kind it still makes
        let mut value = json!({
            "id": "9001",
            "broadcaster_user_id": "1337",
            "broadcaster_user_login": "nelly",
            "broadcaster_user_name": "Nelly",
        });
        assert!(
            serde_json::from_value::<StreamOnlineEvent>(value.clone())
                .unwrap()
                .is_live()
        );
        value["type"] = Value::Null;
        assert!(
            serde_json::from_value::<StreamOnlineEvent>(value)
                .unwrap()
                .is_live()
        );
    }

    #[test]
    fn the_notice_has_the_title_and_the_channels_link() {
        let online = event(json!({}));
        assert_eq!(
            live_text(&online, Some(" Speedrunning Celeste ")),
            "Nelly is live on Twitch: Speedrunning Celeste\nhttps://www.twitch.tv/nelly"
        );
        // The title couldn't be looked up, or there isn't one
        for title in [None, Some(""), Some("  ")] {
            assert_eq!(
                live_text(&online, title),
                "Nelly is live on Twitch\nhttps://www.twitch.tv/nelly"
            );
        }
    }

    #[test]
    fn the_notice_names_the_broadcaster_and_cant_mention_everyone() {
        // A localized display name
        let localized = event(json!({ "broadcaster_user_name": "ネリー" }));
        assert_eq!(
            live_text(&localized, None),
            "ネリー is live on Twitch\nhttps://www.twitch.tv/nelly"
        );

        let unnamed =
            event(json!({ "broadcaster_user_name": " ", "broadcaster_user_login": "Nelly" }));
        assert_eq!(
            live_text(&unnamed, None),
            "nelly is live on Twitch\nhttps://www.twitch.tv/nelly"
        );

        assert_eq!(
            live_text(&event(json!({})), Some("@everyone come in")),
            "Nelly is live on Twitch: @\u{200B}everyone come in\nhttps://www.twitch.tv/nelly"
        );
    }

    #[test]
    fn each_stream_is_announced_once() {
        let first = notice_id(&event(json!({})));
        // Twitch sending the event again
        assert_eq!(notice_id(&event(json!({}))), first);
        // The channel's next stream
        assert_ne!(notice_id(&event(json!({ "id": "9002" }))), first);
        // Another channel's stream with the same id
        assert_ne!(
            notice_id(&event(json!({ "broadcaster_user_id": "1338" }))),
            first
        );
        // A chat message relayed from the channel, whose id can't be the stream's
        assert_ne!(inbound_message_id("1337", "9001"), first);
    }
}
