//! Telegram users' avatars, copied into OpenChat's storage, as the urls of Telegram's own copies
//! contain the bot's token. Telegram doesn't tell bots when a user changes their photo, so the
//! bridge asks at most once a day, when they send a message, and only copies a photo it hasn't
//! copied already.

use crate::api::TelegramApi;
use crate::platform::Telegram;
use anyhow::Result;
use oc_bots_sdk::types::{BlobReference, Milliseconds, TimestampMillis};
use oc_bots_sdk_offchain::env;
use oc_bridge_core::{Bridge, StoredAvatar};
use std::sync::Arc;
use tracing::warn;

// How long a user's avatar is used before Telegram is asked whether they've changed it
const CHECK_INTERVAL: Milliseconds = 24 * 60 * 60 * 1000;
// After a failure, eg. the bot's storage allowance being used up, Telegram is asked again an hour
// later, rather than on each of the user's messages
const RETRY_AFTER_FAILURE: Milliseconds = 60 * 60 * 1000;
// Avatars are shown small, and a photo this wide is a few tens of KB
const MIN_WIDTH: u32 = 320;

pub struct Avatars {
    pub bridge: Arc<Bridge<Telegram>>,
    pub api: Arc<TelegramApi>,
}

impl Avatars {
    /// The user's avatar in OpenChat's storage, or None if they have none the bot can see. If it
    /// can't be updated, the one copied before is used, so the message is still relayed.
    pub async fn avatar(&self, user_id: i64) -> Option<BlobReference> {
        let key = user_id.to_string();
        let stored = match self.bridge.store.avatar(&key).await {
            Ok(stored) => stored,
            Err(error) => {
                warn!(%error, "Failed to read a stored avatar");
                None
            }
        };
        let now = env::now();
        if let Some(stored) = &stored
            && now < stored.checked + CHECK_INTERVAL
        {
            return stored.blob.clone();
        }

        let avatar = match self.refresh(user_id, stored.as_ref(), now).await {
            Ok(avatar) => avatar,
            Err(error) => {
                warn!(%error, user_id, "Failed to update a Telegram user's avatar");
                StoredAvatar {
                    checked: now + RETRY_AFTER_FAILURE - CHECK_INTERVAL,
                    ..stored.unwrap_or(StoredAvatar {
                        photo_id: None,
                        blob: None,
                        checked: now,
                    })
                }
            }
        };
        if let Err(error) = self.bridge.store.save_avatar(&key, &avatar).await {
            warn!(%error, "Failed to store an avatar");
        }
        avatar.blob
    }

    async fn refresh(
        &self,
        user_id: i64,
        stored: Option<&StoredAvatar>,
        now: TimestampMillis,
    ) -> Result<StoredAvatar> {
        let Some(photo) = self.api.current_profile_photo(user_id, MIN_WIDTH).await? else {
            return Ok(StoredAvatar {
                photo_id: None,
                blob: None,
                checked: now,
            });
        };
        if let Some(stored) = stored
            && stored.photo_id.as_deref() == Some(photo.file_unique_id.as_str())
            && stored.blob.is_some()
        {
            return Ok(StoredAvatar {
                checked: now,
                ..stored.clone()
            });
        }

        let bytes = self.api.download_file(&photo.file_id).await?;
        // Telegram's profile photos are JPEGs
        let blob = self
            .bridge
            .openchat
            .upload_file(&bytes, "image/jpeg")
            .await?;
        Ok(StoredAvatar {
            photo_id: Some(photo.file_unique_id),
            blob: Some(blob),
            checked: now,
        })
    }
}
