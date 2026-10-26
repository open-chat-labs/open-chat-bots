//! Tells a paired channel's OpenChat chat when the channel goes live, with its link, so members can
//! watch from there. Going offline isn't announced, to keep the chat quiet.

use crate::chat::twitch_user;
use crate::platform::Twitch;
use anyhow::Result;
use oc_bots_sdk::types::{BridgedUser, MessageId};
use oc_bridge_core::util::{inbound_message_id, without_mention_everyone};
use oc_bridge_core::{Bridge, Platform};
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
    /// "live", or eg. "rerun"
    #[serde(rename = "type", default)]
    pub kind: Option<String>,
}

impl StreamOnlineEvent {
    /// Unless Twitch says it's another kind, eg. a rerun
    pub fn is_live(&self) -> bool {
        self.kind.as_deref().is_none_or(|kind| kind == "live")
    }
}

/// Tells the OpenChat chat the channel's paired with, if any, that the channel's live. It's posted
/// as relayed from the broadcaster, as their chat messages are, so tipping it tips them.
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
    let mut author = author(&event)?;
    bridge.platform.complete_author(&mut author).await;
    // Unlike a chat message, it isn't recorded as relayed, so a reply to it in OpenChat is relayed
    // to Twitch as a message of its own
    bridge
        .openchat
        .send(
            &pairing,
            notice_id(&event),
            author,
            live_text(&event, title.as_deref()),
            None,
        )
        .await?;
    Ok(())
}

/// The broadcaster. Their profile image is filled in by `Twitch::complete_author`.
pub fn author(event: &StreamOnlineEvent) -> Result<BridgedUser> {
    twitch_user(
        &event.broadcaster_user_id,
        &event.broadcaster_user_login,
        &event.broadcaster_user_name,
        None,
    )
}

/// Derived from the stream, as Twitch can send the event twice, and OpenChat doesn't post a message
/// whose id the chat has already. So a stream isn't announced more than once.
pub fn notice_id(event: &StreamOnlineEvent) -> MessageId {
    inbound_message_id(
        &event.broadcaster_user_id,
        &format!("stream.online/{}", event.id),
    )
}

/// eg. "Live on Twitch: Speedrunning Celeste", then the channel's link on its own line, which OpenChat
/// can play the stream from. OpenChat shows the broadcaster as its author.
pub fn live_text(event: &StreamOnlineEvent, title: Option<&str>) -> String {
    // In angle brackets, as OpenChat's markdown would otherwise leave a login's trailing "_" out of
    // the link
    let url = format!(
        "<https://www.twitch.tv/{}>",
        event.broadcaster_user_login.to_lowercase()
    );
    let text = match title.map(str::trim).filter(|title| !title.is_empty()) {
        Some(title) => format!("Live on Twitch: {title}\n{url}"),
        None => format!("Live on Twitch\n{url}"),
    };
    // The broadcaster chooses the title, but can't mention everyone in OpenChat
    without_mention_everyone(&text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use oc_bots_sdk::types::TwitchUser;
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

        // In case Twitch stops sending it
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

    // So OpenChat shows them as its author, and tips go to whoever linked their account
    #[test]
    fn the_broadcaster_is_the_author() {
        let BridgedUser::Twitch(user) = author(&event(json!({}))).unwrap() else {
            panic!("Expected a Twitch user");
        };
        assert_eq!(
            user,
            TwitchUser {
                id: 1337,
                login: "nelly".to_string(),
                display_name: "Nelly".to_string(),
                profile_image: None,
            }
        );

        let unnamed = event(json!({ "broadcaster_user_name": "" }));
        let BridgedUser::Twitch(user) = author(&unnamed).unwrap() else {
            panic!("Expected a Twitch user");
        };
        assert_eq!(user.display_name, "nelly");
    }

    #[test]
    fn the_notice_has_the_title_and_the_channels_link() {
        let online = event(json!({}));
        assert_eq!(
            live_text(&online, Some(" Speedrunning Celeste ")),
            "Live on Twitch: Speedrunning Celeste\n<https://www.twitch.tv/nelly>"
        );
        // The title couldn't be looked up, or there isn't one
        for title in [None, Some(""), Some("  ")] {
            assert_eq!(
                live_text(&online, title),
                "Live on Twitch\n<https://www.twitch.tv/nelly>"
            );
        }
    }

    #[test]
    fn the_link_is_to_the_whole_login_and_everyone_isnt_mentioned() {
        // A login can end in "_", which the link keeps
        let underscored = event(json!({ "broadcaster_user_login": "nelly_" }));
        assert_eq!(
            live_text(&underscored, None),
            "Live on Twitch\n<https://www.twitch.tv/nelly_>"
        );

        let capitalized = event(json!({ "broadcaster_user_login": "Nelly" }));
        assert_eq!(
            live_text(&capitalized, None),
            "Live on Twitch\n<https://www.twitch.tv/nelly>"
        );

        assert_eq!(
            live_text(&event(json!({})), Some("@everyone come in")),
            "Live on Twitch: @\u{200B}everyone come in\n<https://www.twitch.tv/nelly>"
        );
    }

    #[test]
    fn a_stream_isnt_announced_twice() {
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
