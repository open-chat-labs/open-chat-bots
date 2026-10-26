//! Whispers, which Twitch only takes from the sending account's own token, unlike chat messages,
//! which the app's token sends. The bot's account grants it at `/authorize-bot`, and the bridge
//! keeps it, with its refresh token, in its store, so it survives restarts.

use crate::api::{TwitchApi, UserToken};
use anyhow::{Context, Result};
use oc_bots_sdk::types::TimestampMillis;
use oc_bots_sdk_offchain::env;
use oc_bridge_core::BridgeStore;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

// A token is replaced this long before it expires
const REFRESH_MARGIN: TimestampMillis = 10 * 60 * 1000;

/// The bot account's own token
pub struct BotToken {
    store: BridgeStore,
    cached: Mutex<Option<StoredToken>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct StoredToken {
    access_token: String,
    refresh_token: String,
    /// When it's to be replaced, a little before it expires
    refresh_at: TimestampMillis,
}

impl StoredToken {
    fn from_user_token(token: UserToken, now: TimestampMillis) -> Result<Self> {
        Ok(StoredToken {
            access_token: token.access_token,
            refresh_token: token
                .refresh_token
                .context("Twitch didn't return a refresh token")?,
            refresh_at: (now + token.expires_in.unwrap_or_default() * 1000)
                .saturating_sub(REFRESH_MARGIN),
        })
    }
}

impl BotToken {
    pub fn new(store: BridgeStore) -> Self {
        BotToken {
            store,
            cached: Mutex::default(),
        }
    }

    /// Keeps the token the bot's account granted at `/authorize-bot`
    pub async fn save(&self, token: UserToken) -> Result<()> {
        let token = StoredToken::from_user_token(token, env::now())?;
        self.store.save_bot_token(&token).await?;
        *self.cached.lock().await = Some(token);
        Ok(())
    }

    /// Checks Twitch still takes the token, as it requires of an app which keeps a user's token when
    /// it starts, then hourly, and replaces it if not. There's nothing to check until the bot's
    /// account has granted one.
    pub async fn validate(&self, api: &TwitchApi) -> Result<()> {
        let access_token = {
            let mut cached = self.cached.lock().await;
            if cached.is_none() {
                *cached = self.store.bot_token().await?;
            }
            match cached.as_ref() {
                Some(token) => token.access_token.clone(),
                None => return Ok(()),
            }
        };
        if !api.validate_token(&access_token).await? {
            self.access_token(api, true).await?;
        }
        Ok(())
    }

    /// The token, replaced first if it's about to expire, or if `refresh` is set, eg. once Twitch
    /// has refused it
    pub async fn access_token(&self, api: &TwitchApi, refresh: bool) -> Result<String> {
        let mut cached = self.cached.lock().await;
        if cached.is_none() {
            *cached = self.store.bot_token().await?;
        }
        let token = cached.as_ref().context(
            "The bot's account hasn't granted the bridge a token to whisper with at /authorize-bot",
        )?;
        if !refresh && env::now() < token.refresh_at {
            return Ok(token.access_token.clone());
        }
        let refreshed = StoredToken::from_user_token(
            api.refresh_user_token(&token.refresh_token).await?,
            env::now(),
        )?;
        self.store.save_bot_token(&refreshed).await?;
        let access_token = refreshed.access_token.clone();
        *cached = Some(refreshed);
        Ok(access_token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use oc_bots_sdk::types::BridgePlatform;
    use oc_bridge_core::InMemoryStore;
    use std::sync::Arc;

    #[tokio::test]
    async fn the_stored_token_is_used_until_its_due_to_be_replaced() {
        let store = BridgeStore::new(Arc::new(InMemoryStore::default()), BridgePlatform::Twitch);
        let api = TwitchApi::new("abc".to_string(), "secret".to_string());
        let bot_token = BotToken::new(store.clone());

        // Until the bot's account has granted one, there's none to use, nor to check
        let error = bot_token.access_token(&api, false).await.unwrap_err();
        assert!(error.to_string().contains("/authorize-bot"), "{error}");
        bot_token.validate(&api).await.unwrap();

        // eg. granted before a restart
        let stored = StoredToken {
            access_token: "x".to_string(),
            refresh_token: "y".to_string(),
            refresh_at: TimestampMillis::MAX,
        };
        store.save_bot_token(&stored).await.unwrap();
        assert_eq!(bot_token.access_token(&api, false).await.unwrap(), "x");
    }

    #[test]
    fn a_token_is_replaced_before_it_expires() {
        let token: UserToken = serde_json::from_str(
            r#"{"access_token":"x","expires_in":14000,"refresh_token":"y","scope":["user:manage:whispers"],"token_type":"bearer"}"#,
        )
        .unwrap();
        assert_eq!(
            StoredToken::from_user_token(token, 1_000_000).unwrap(),
            StoredToken {
                access_token: "x".to_string(),
                refresh_token: "y".to_string(),
                refresh_at: 1_000_000 + 14_000_000 - REFRESH_MARGIN,
            }
        );
    }

    #[test]
    fn a_token_without_a_refresh_token_isnt_kept() {
        let token: UserToken =
            serde_json::from_str(r#"{"access_token":"x","expires_in":14000}"#).unwrap();
        assert!(StoredToken::from_user_token(token, 0).is_err());
    }
}
