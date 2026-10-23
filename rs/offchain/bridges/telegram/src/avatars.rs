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
            && !is_due(stored, now)
        {
            return stored.photo_id.clone();
        }

        let avatar = match self.update(user_id, stored.as_ref(), now).await {
            Ok(avatar) => avatar,
            Err(error) => {
                warn!(%error, user_id, "Failed to update a Telegram user's photo");
                after_failure(stored, now)
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
        let plan = plan(
            stored,
            photo.as_ref().map(|photo| photo.file_unique_id.clone()),
            now,
        );

        if let Some(replaced) = &plan.delete {
            // Not worth holding up the user's new photo for, so it's left if this fails
            if let Err(error) = self
                .s3
                .delete_object()
                .bucket(&self.bucket)
                .key(object_key(user_id, replaced))
                .send()
                .await
            {
                warn!(error = %DisplayErrorContext(error), user_id, "Failed to delete a replaced photo");
            }
        }
        if let Some(photo) = photo.filter(|_| plan.upload) {
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
        Ok(plan.record)
    }
}

/// What a check does, given what the bridge recorded and the user's current photo
#[derive(Debug, PartialEq)]
struct Plan {
    /// A photo replaced at the last check, deleted now that OpenChat's clients have the new profile
    delete: Option<String>,
    /// Whether the current photo is new, so needs copying
    upload: bool,
    record: StoredAvatar,
}

fn plan(stored: Option<&StoredAvatar>, photo_id: Option<String>, now: TimestampMillis) -> Plan {
    let previous = stored.and_then(|stored| stored.photo_id.clone());
    // Unless the user has gone back to it
    let delete = stored
        .and_then(|stored| stored.replaced.clone())
        .filter(|replaced| photo_id.as_ref() != Some(replaced));
    let changed = photo_id != previous;
    Plan {
        delete,
        upload: changed && photo_id.is_some(),
        record: StoredAvatar {
            photo_id,
            replaced: if changed { previous } else { None },
            checked: now,
        },
    }
}

fn is_due(stored: &StoredAvatar, now: TimestampMillis) -> bool {
    now >= stored.checked + CHECK_INTERVAL
}

// What was recorded before is kept, but due again after `RETRY_AFTER_FAILURE`
fn after_failure(stored: Option<StoredAvatar>, now: TimestampMillis) -> StoredAvatar {
    StoredAvatar {
        checked: now + RETRY_AFTER_FAILURE - CHECK_INTERVAL,
        ..stored.unwrap_or(StoredAvatar {
            photo_id: None,
            replaced: None,
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

    const NOW: TimestampMillis = 1_000_000_000_000;

    fn record(photo_id: Option<&str>, replaced: Option<&str>) -> StoredAvatar {
        StoredAvatar {
            photo_id: photo_id.map(str::to_string),
            replaced: replaced.map(str::to_string),
            checked: NOW,
        }
    }

    fn check(stored: Option<StoredAvatar>, photo_id: Option<&str>) -> Plan {
        plan(stored.as_ref(), photo_id.map(str::to_string), NOW)
    }

    #[test]
    fn a_first_photo_is_copied() {
        assert_eq!(
            check(None, Some("x")),
            Plan {
                delete: None,
                upload: true,
                record: record(Some("x"), None),
            }
        );
        assert_eq!(
            check(None, None),
            Plan {
                delete: None,
                upload: false,
                record: record(None, None),
            }
        );
    }

    #[test]
    fn an_unchanged_photo_is_left() {
        assert_eq!(
            check(Some(record(Some("x"), None)), Some("x")),
            Plan {
                delete: None,
                upload: false,
                record: record(Some("x"), None),
            }
        );
    }

    #[test]
    fn a_replaced_photo_is_deleted_at_the_next_check() {
        let changed = check(Some(record(Some("x"), None)), Some("y"));
        assert_eq!(
            changed,
            Plan {
                delete: None,
                upload: true,
                record: record(Some("y"), Some("x")),
            }
        );
        assert_eq!(
            check(Some(changed.record), Some("y")),
            Plan {
                delete: Some("x".to_string()),
                upload: false,
                record: record(Some("y"), None),
            }
        );
    }

    #[test]
    fn a_photo_replaced_again_before_the_next_check() {
        assert_eq!(
            check(Some(record(Some("y"), Some("x"))), Some("z")),
            Plan {
                delete: Some("x".to_string()),
                upload: true,
                record: record(Some("z"), Some("y")),
            }
        );
    }

    #[test]
    fn going_back_to_a_replaced_photo_keeps_it() {
        assert_eq!(
            check(Some(record(Some("y"), Some("x"))), Some("x")),
            Plan {
                delete: None,
                upload: true,
                record: record(Some("x"), Some("y")),
            }
        );
    }

    #[test]
    fn a_removed_photo_is_deleted_at_the_next_check() {
        let removed = check(Some(record(Some("x"), None)), None);
        assert_eq!(
            removed,
            Plan {
                delete: None,
                upload: false,
                record: record(None, Some("x")),
            }
        );
        assert_eq!(
            check(Some(removed.record), None),
            Plan {
                delete: Some("x".to_string()),
                upload: false,
                record: record(None, None),
            }
        );
    }

    #[test]
    fn a_photo_is_checked_daily() {
        let stored = record(Some("x"), None);
        assert!(!is_due(&stored, NOW + CHECK_INTERVAL - 1));
        assert!(is_due(&stored, NOW + CHECK_INTERVAL));
    }

    #[test]
    fn after_a_failure_the_record_is_kept_and_checked_an_hour_later() {
        let failed = after_failure(Some(record(Some("y"), Some("x"))), NOW);
        assert_eq!(failed.photo_id.as_deref(), Some("y"));
        assert_eq!(failed.replaced.as_deref(), Some("x"));
        assert!(!is_due(&failed, NOW + RETRY_AFTER_FAILURE - 1));
        assert!(is_due(&failed, NOW + RETRY_AFTER_FAILURE));

        let first = after_failure(None, NOW);
        assert_eq!(first.photo_id, None);
        assert!(is_due(&first, NOW + RETRY_AFTER_FAILURE));
    }

    #[test]
    fn photo_ids_are_checked_as_openchat_does() {
        assert!(is_valid_photo_id("AQADtLwxG5a_QEZ-"));
        for invalid in ["", "a b", "a/b", "a.jpg", &"a".repeat(65)] {
            assert!(!is_valid_photo_id(invalid), "{invalid}");
        }
    }
}
