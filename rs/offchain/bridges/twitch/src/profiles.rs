//! Twitch users' profile images, which OpenChat shows with their relayed messages. Twitch's chat
//! events don't include them, so the bridge looks them up, and keeps them for a day.

use crate::api::TwitchApi;
use oc_bridge_core::util::TWITCH_CDN_URL;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::Instant;
use tracing::warn;

// How long an image is used before Twitch is asked whether the user has changed it
const CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
// After a failure, Twitch is asked again an hour later, rather than on each of the user's messages
const RETRY_AFTER_FAILURE: Duration = Duration::from_secs(60 * 60);
// How long a message can be held up by looking up its author's image
const TIME_LIMIT: Duration = Duration::from_secs(5);
// More than a busy channel's chatters in a day. Past it, those not checked for a day are forgotten.
const MAX_CACHED: usize = 100_000;
// What OpenChat accepts as a profile image's path
const MAX_PATH_LENGTH: usize = 128;

pub struct Profiles {
    api: Arc<TwitchApi>,
    // Each user's image's path, if they have one, and when to check it again
    images: Mutex<HashMap<u64, (Option<String>, Instant)>>,
}

impl Profiles {
    pub fn new(api: Arc<TwitchApi>) -> Self {
        Profiles {
            api,
            images: Mutex::default(),
        }
    }

    /// The path of the user's profile image on Twitch's CDN. If it can't be looked up, the one
    /// found before, if any, is used.
    pub async fn image(&self, user_id: u64) -> Option<String> {
        let now = Instant::now();
        let cached = self.images.lock().unwrap().get(&user_id).cloned();
        if let Some((image, check_at)) = &cached
            && now < *check_at
        {
            return image.clone();
        }

        let id = user_id.to_string();
        let (image, check_at) =
            match tokio::time::timeout(TIME_LIMIT, self.api.users_by_id(&[&id])).await {
                Ok(Ok(users)) => (
                    users
                        .first()
                        .and_then(|u| profile_image_path(&u.profile_image_url)),
                    now + CHECK_INTERVAL,
                ),
                failed => {
                    let error = match failed {
                        Ok(Err(error)) => error.to_string(),
                        _ => "timed out".to_string(),
                    };
                    warn!(error, user_id, "Failed to look up a Twitch user's image");
                    (
                        cached.and_then(|(image, _)| image),
                        now + RETRY_AFTER_FAILURE,
                    )
                }
            };

        let mut images = self.images.lock().unwrap();
        if images.len() >= MAX_CACHED {
            images.retain(|_, (_, check_at)| now < *check_at);
        }
        images.insert(user_id, (image.clone(), check_at));
        image
    }
}

/// The path of a profile image on Twitch's CDN, as OpenChat takes it, from its url, or None if it's
/// elsewhere or a path OpenChat wouldn't accept
pub fn profile_image_path(url: &str) -> Option<String> {
    let path = url.strip_prefix(TWITCH_CDN_URL)?.strip_prefix('/')?;
    let valid = path.len() <= MAX_PATH_LENGTH
        && path.split('/').all(|segment| {
            !segment.is_empty()
                && segment.chars().any(|c| c != '.')
                && segment
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
        });
    valid.then(|| path.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_images_path_is_taken_from_twitchs_cdn() {
        assert_eq!(
            profile_image_path(
                "https://static-cdn.jtvnw.net/jtv_user_pictures/8a6381c7-d0c0-4576-b179-38bd5ce1d6af-profile_image-300x300.png"
            )
            .as_deref(),
            Some("jtv_user_pictures/8a6381c7-d0c0-4576-b179-38bd5ce1d6af-profile_image-300x300.png")
        );
        // Twitch's default images
        assert!(
            profile_image_path(
                "https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png"
            )
            .is_some()
        );
    }

    #[test]
    fn an_image_elsewhere_or_with_an_odd_path_isnt_sent() {
        for url in [
            "",
            "https://example.com/a.png",
            "https://static-cdn.jtvnw.net.example.com/a.png",
            "https://static-cdn.jtvnw.net/",
            "https://static-cdn.jtvnw.net/a/../b.png",
            "https://static-cdn.jtvnw.net/a.png?size=70",
            &format!("https://static-cdn.jtvnw.net/{}.png", "a".repeat(130)),
        ] {
            assert_eq!(profile_image_path(url), None, "{url}");
        }
    }
}
