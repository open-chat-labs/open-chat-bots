//! Telegram users' profile photos, copied to an S3 bucket behind the bridges' CDN, as the urls of
//! Telegram's own copies contain the bot's token. OpenChat builds a photo's url from the user's id
//! and the photo's `file_unique_id`, so a new photo has a new url. Telegram doesn't tell bots when a
//! user changes their photo, so the bridge asks at most once a day, when they send a message.

use crate::api::TelegramApi;
use anyhow::{Result, anyhow};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::error::DisplayErrorContext;
use aws_sdk_s3::primitives::ByteStream;
use oc_bots_sdk::types::{Milliseconds, TimestampMillis};
use oc_bots_sdk_offchain::env;
use oc_bridge_core::{BridgeStore, StoredAvatar};
use std::sync::Arc;
use std::time::Duration;
use tracing::warn;

// How long a user's photo is used before Telegram is asked whether they've changed it
const CHECK_INTERVAL: Milliseconds = 24 * 60 * 60 * 1000;
// After a failure, Telegram is asked again an hour later, rather than on each of the user's messages
const RETRY_AFTER_FAILURE: Milliseconds = 60 * 60 * 1000;
// Avatars are shown small, and a photo this wide is a few tens of KB
const MIN_WIDTH: u32 = 320;
// How long a message can be held up by updating its author's photo
const TIME_LIMIT: Duration = Duration::from_secs(10);
// What OpenChat accepts, which Telegram's ids are, so a message isn't refused for one which isn't
const MAX_PHOTO_ID_LENGTH: usize = 64;

pub struct Avatars {
    store: BridgeStore,
    api: Arc<TelegramApi>,
    s3: S3Client,
    bucket: String,
}

impl Avatars {
    /// Uses the AWS credentials and region from the environment
    pub async fn new(store: BridgeStore, api: Arc<TelegramApi>, bucket: String) -> Self {
        let config = aws_config::load_from_env().await;
        Avatars {
            store,
            api,
            s3: S3Client::new(&config),
            bucket,
        }
    }

    /// The id of the user's photo on the CDN, or None if they have none the bot can see. If it
    /// can't be updated, the one copied before is used, so the message is relayed with it.
    pub async fn photo_id(&self, user_id: i64) -> Option<String> {
        let key = user_id.to_string();
        let now = env::now();
        let stored = match self.store.avatar(&key).await {
            Ok(stored) => stored,
            Err(error) => {
                // The record isn't overwritten, as it may name a replaced photo still to delete
                warn!(%error, "Failed to read a stored avatar");
                return match self.update(user_id, None, now).await {
                    Ok(avatar) => avatar.photo_id,
                    Err(error) => {
                        warn!(%error, user_id, "Failed to update a Telegram user's photo");
                        None
                    }
                };
            }
        };
        if let Some(stored) = &stored
            && now < stored.checked + CHECK_INTERVAL
        {
            return stored.photo_id.clone();
        }

        let avatar = match self.update(user_id, stored.as_ref(), now).await {
            Ok(avatar) => avatar,
            Err(error) => {
                warn!(%error, user_id, "Failed to update a Telegram user's photo");
                StoredAvatar {
                    checked: now + RETRY_AFTER_FAILURE - CHECK_INTERVAL,
                    ..stored.unwrap_or(StoredAvatar {
                        photo_id: None,
                        replaced: None,
                        checked: now,
                    })
                }
            }
        };
        if let Err(error) = self.store.save_avatar(&key, &avatar).await {
            warn!(%error, "Failed to store an avatar");
        }
        avatar.photo_id
    }

    async fn update(
        &self,
        user_id: i64,
        stored: Option<&StoredAvatar>,
        now: TimestampMillis,
    ) -> Result<StoredAvatar> {
        tokio::time::timeout(TIME_LIMIT, self.check(user_id, stored, now)).await?
    }

    async fn check(
        &self,
        user_id: i64,
        stored: Option<&StoredAvatar>,
        now: TimestampMillis,
    ) -> Result<StoredAvatar> {
        let photo = self
            .api
            .current_profile_photo(user_id, MIN_WIDTH)
            .await?
            .filter(|photo| {
                let valid = is_valid_photo_id(&photo.file_unique_id);
                if !valid {
                    warn!(
                        photo_id = photo.file_unique_id,
                        "Unexpected Telegram photo id"
                    );
                }
                valid
            });
        let photo_id = photo.as_ref().map(|photo| photo.file_unique_id.clone());
        let previous = stored.and_then(|stored| stored.photo_id.clone());

        // Deleted a day after it was replaced, by when OpenChat's clients have the new profile,
        // unless the user has gone back to it
        if let Some(replaced) = stored.and_then(|stored| stored.replaced.as_ref())
            && photo_id.as_ref() != Some(replaced)
        {
            self.s3
                .delete_object()
                .bucket(&self.bucket)
                .key(object_key(user_id, replaced))
                .send()
                .await
                .map_err(|error| {
                    anyhow!("Deleting a photo failed: {}", DisplayErrorContext(error))
                })?;
        }
        if photo_id == previous {
            return Ok(StoredAvatar {
                photo_id,
                replaced: None,
                checked: now,
            });
        }

        if let Some(photo) = photo {
            let bytes = self.api.download_file(&photo.file_id).await?;
            self.s3
                .put_object()
                .bucket(&self.bucket)
                .key(object_key(user_id, &photo.file_unique_id))
                .body(ByteStream::from(bytes))
                // Telegram's profile photos are JPEGs
                .content_type("image/jpeg")
                // A new photo has a new key
                .cache_control("public, max-age=31536000, immutable")
                .send()
                .await
                .map_err(|error| {
                    anyhow!("Uploading a photo failed: {}", DisplayErrorContext(error))
                })?;
        }
        Ok(StoredAvatar {
            photo_id,
            replaced: previous,
            checked: now,
        })
    }
}

// Where OpenChat looks for the photo, under the CDN's url
fn object_key(user_id: i64, photo_id: &str) -> String {
    format!("telegram/{user_id}/{photo_id}.jpg")
}

fn is_valid_photo_id(photo_id: &str) -> bool {
    !photo_id.is_empty()
        && photo_id.len() <= MAX_PHOTO_ID_LENGTH
        && photo_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn photo_ids_are_checked_as_openchat_does() {
        assert!(is_valid_photo_id("AQADtLwxG5a_QEZ-"));
        for invalid in ["", "a b", "a/b", "a.jpg", &"a".repeat(65)] {
            assert!(!is_valid_photo_id(invalid), "{invalid}");
        }
    }
}
