use crate::errors::BotError;
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use poise::serenity_prelude::ChannelId;
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::File;
use std::io::Read;
use std::io::Write;
use std::sync::Arc;
use std::{collections::HashMap, path::Path};
use tokio::sync::RwLock;

use crate::shared::RelayLink;

#[derive(Clone, Debug, Deserialize)]
pub struct AesKey(pub Vec<u8>);
pub type RelayLinkMap = HashMap<ChannelId, RelayLink>;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PersistData {
    pub relay_links: RelayLinkMap,
}

#[derive(Debug)]
pub struct BotState {
    pub aes_key: Option<AesKey>,
    pub store_path: Option<String>,
    pub relay_links: Arc<RwLock<RelayLinkMap>>,
}

pub struct BotStateBuilder {
    aes_key: Option<AesKey>,
    store_path: Option<String>,
}

impl BotStateBuilder {
    pub fn with_encryption_key(self, aes_key: Option<AesKey>) -> Self {
        Self { aes_key, ..self }
    }

    pub fn with_store_path(self, store_path: Option<String>) -> Self {
        Self { store_path, ..self }
    }

    pub async fn build(self) -> Result<BotState, BotError> {
        let bot_state = BotState {
            aes_key: self.aes_key,
            store_path: self.store_path,
            relay_links: Arc::new(RwLock::new(HashMap::new())),
        };

        bot_state.restore().await
    }
}

impl BotState {
    pub fn builder() -> BotStateBuilder {
        BotStateBuilder {
            aes_key: None,
            store_path: None,
        }
    }

    pub async fn set_relay_link(
        &self,
        channel_id: ChannelId,
        relay_link: RelayLink,
    ) -> Result<(), BotError> {
        self.relay_links
            .write()
            .await
            .insert(channel_id, relay_link);
        self.persist().await
    }

    pub async fn get_relay_link(&self, channel_id: ChannelId) -> Option<RelayLink> {
        self.relay_links.read().await.get(&channel_id).cloned()
    }

    pub async fn remove_relay_link(&self, channel_id: ChannelId) -> bool {
        let removed_link = self.relay_links.write().await.remove(&channel_id);
        removed_link.is_some()
    }

    /// Restore previously saved state
    ///
    /// Loads data from the state file, if store path is provided. If the
    /// encryption key is also provided, it will try to decrypt the file.
    /// If we change the config to add/remove encryption key, we need to clear
    /// previous state manually.
    ///
    //  TODO provide a utility to encrypt/decrypt state if we're either removing,
    //  adding, or replacing encryption key.
    pub async fn restore(self) -> Result<Self, BotError> {
        if let Some(store_path) = self.store_path.clone() {
            let path = Path::new(store_path.as_str());

            // If state file does not exist, can't really read it.
            if !path.exists() {
                return Ok(self);
            }

            // Read state from disk
            let mut store_file = File::open(path).map_err(BotError::FailedToOpenStoreFile)?;
            let mut persisted_data = vec![];
            store_file
                .read_to_end(&mut persisted_data)
                .map_err(BotError::FailedToReadState)?;

            // If we have a cypher key, assume data is encrypted!
            let json_data = if let Some(AesKey(key)) = self.aes_key.clone() {
                let decryption_key = Key::<Aes256Gcm>::from_slice(&key);
                let (nonce_arr, ciphered_data) = persisted_data.split_at(12);
                let nonce = Nonce::from_slice(nonce_arr);
                let cipher = Aes256Gcm::new(decryption_key);
                cipher
                    .decrypt(nonce, ciphered_data.as_ref())
                    .map_err(BotError::FailedToDecryptState)?
            } else {
                persisted_data
            };

            // Parse data
            let store_data = serde_json::from_slice::<PersistData>(&json_data)
                .map_err(BotError::FailedToDeserialiseState)?;

            Ok(Self {
                relay_links: Arc::new(RwLock::new(store_data.relay_links)),
                ..self
            })
        } else {
            Ok(self)
        }
    }

    /// Persist current state!
    ///
    /// Stores current state to a file (which may be encrypted), if the store
    /// file path has been provided.
    pub async fn persist(&self) -> Result<(), BotError> {
        if let Some(store_path) = &self.store_path {
            let store_data = self.prepare_store_data().await?;

            // Make sure path exists for the file to be saved to, if there is a path.
            let path = std::path::Path::new(store_path);
            if let Some(prefix) = path.parent() {
                fs::create_dir_all(prefix).map_err(BotError::FailedToCreateStoreFilePath)?;
            }

            // Open file for writing, if file exists it will be truncated!
            let mut file = fs::File::create(store_path).map_err(BotError::FailedToOpenStoreFile)?;
            // Save store data!
            file.write_all(&store_data)
                .map_err(BotError::FailedToWriteState)?;
        }

        Ok(())
    }

    async fn prepare_store_data(&self) -> Result<Vec<u8>, BotError> {
        // Prepare data for serialisation!
        let persist_data = PersistData {
            relay_links: self.relay_links.read().await.clone(),
        };

        // Serialise data!
        // TODO we're already using TOML, no need to have serde_json
        let serialised_data =
            serde_json::to_vec(&persist_data).map_err(BotError::FailedToSerialiseState)?;

        Ok(if let Some(AesKey(encryption_key)) = &self.aes_key {
            // Encrypted data if key was provided!
            let key = Key::<Aes256Gcm>::from_slice(encryption_key.as_slice());
            let cipher = Aes256Gcm::new(key);
            let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
            let ciphered_data = cipher
                .encrypt(&nonce, serialised_data.as_ref())
                .map_err(BotError::FailedToEncryptState)?;

            // Extend ciphered data by adding nonce! Nonce is not a secret value,
            // and we need it for successful decryption.
            let mut encrypted_data: Vec<u8> = nonce.to_vec();
            encrypted_data.extend_from_slice(&ciphered_data);

            encrypted_data
        } else {
            // Just return serialised data!
            serialised_data
        })
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::shared::OcChannelKey;
    use fs::remove_file;
    use oc_bots_sdk::types::AuthToken;
    use poise::serenity_prelude::ChannelId;
    use std::error::Error;

    #[tokio::test]
    async fn state_is_encrypted() -> Result<(), Box<dyn Error>> {
        // This data would be deserialised from the config
        let key = b"-this-is-very-silly--32-bit-key-";
        let store_path_str = "../../target/unit_tests/store.db".to_string();
        let store_path = std::path::Path::new(store_path_str.as_str());

        // Clean up from previous tests
        if store_path.exists() {
            remove_file(store_path)?;
        }

        // Init state and modify it!
        let state = BotState::builder()
            .with_encryption_key(Some(AesKey(key.to_vec())))
            .with_store_path(Some(store_path_str.clone()))
            .build()
            .await?;

        let ds_channel_id = ChannelId::new(2);
        state
            .set_relay_link(
                ds_channel_id,
                RelayLink {
                    ds_channel_id,
                    oc_channel_key: OcChannelKey::new("this-is-key".into()),
                    oc_auth_token: AuthToken::ApiKey("this-is-api-key".into()),
                    error: None,
                },
            )
            .await?;

        // Persist state to an encrypted file
        state.persist().await?;
        drop(state);

        // Initialise a new value, and expect the state to be restored!
        let new_state = BotState::builder()
            .with_encryption_key(Some(AesKey(key.to_vec())))
            .with_store_path(Some(store_path_str.clone()))
            .build()
            .await?;

        let restored_link = new_state
            .get_relay_link(ChannelId::new(2))
            .await
            .expect("Could not find the link after state was restored");

        assert_eq!(restored_link.ds_channel_id, ChannelId::new(2));
        assert_eq!(
            restored_link.oc_channel_key,
            OcChannelKey::new("this-is-key".into())
        );
        assert_eq!(
            restored_link.oc_auth_token.into(),
            "this-is-api-key".to_string()
        );
        assert_eq!(restored_link.error, None);

        Ok(())
    }

    // This test should catch errors that may occur when property names of the
    // state struct are changed, and state is serialised with the old names.
    // TODO devise a migration mechanism for this case!
    #[tokio::test]
    async fn state_decodes_correctly_from_string() -> Result<(), Box<dyn Error>> {
        let store_str = r#"{
            "relay_links":{
                "1338817539941077055":{
                    "ds_channel_id":"1338817539941077055",
                    "oc_channel_key":"dzh22-nuaaa-aaaaa-qaaoa-cai",
                    "oc_auth_token":{
                        "ApiKey":"eyJnYXRld2F5IjoiY3VqNnUtYzRhYWEtYWFhYWEtcWFhanEtY2FpIiwiYm90X2lkIjoiZWNieHotdHR4bWctM29hZ3QtcHB3MmEiLCJzY29wZSI6eyJDaGF0Ijp7Ikdyb3VwIjoiZHpoMjItbnVhYWEtYWFhYWEtcWFhb2EtY2FpIn19LCJzZWNyZXQiOiIxNjQ1NDMzNjM3NjQ5NzkxMDYxNzUwMTI0MTIwOTIwMDY5NzAzODAiLCJwZXJtaXNzaW9ucyI6eyJtZXNzYWdlIjoxfX0="
                    },
                    "error":null
                }
            }
        }"#;

        serde_json::from_str::<PersistData>(store_str)?;
        Ok(())
    }
}
