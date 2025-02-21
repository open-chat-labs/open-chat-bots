use crate::errors::BotError;
use serde::de::Deserializer;
use serde::Deserialize;
use serde_valid::validation::Error as ValidError;
use serde_valid::Validate;
use std::fs;

#[derive(Clone, Deserialize, Debug)]
pub struct Config {
    pub discord: DiscordConfig,
    pub openchat: OpenChatConfig,
    pub system: SystemConfig,
}

impl Config {
    pub fn from_file(path: &str) -> Result<Self, BotError> {
        let content = fs::read_to_string(path).map_err(BotError::ConfigFileError)?;
        Ok(toml::from_str(&content)?)
    }
}

#[derive(Clone, Deserialize, Debug)]
pub struct DiscordConfig {
    pub token: String,
}

#[derive(Clone, Deserialize, Debug)]
pub struct OpenChatConfig {
    pub ic_url: String,
    pub public_key: String,
    pub bot: OpenChatBotConfig,
}

#[derive(Clone, Deserialize, Debug)]
pub struct OpenChatBotConfig {
    pub port: u16,
    pub private_key_path: String,
}

#[derive(Clone, Deserialize, Debug, Validate)]
pub struct SystemConfig {
    pub store_path: Option<String>,
    // ...
    #[serde(with = "serde_bytes")]
    #[validate(custom = validate_encryption_key)]
    pub store_encryption_key: Option<Vec<u8>>,
    // ...
    #[serde(deserialize_with = "deserialize_log_level")]
    pub log_level: tracing::Level,
}

// Adds a validation function to the SystemConfig, validation is done in main.
fn validate_encryption_key(key: &Option<Vec<u8>>) -> Result<(), ValidError> {
    if let Some(bytes) = key.clone() {
        if bytes.len() == 32 {
            Ok(())
        } else {
            Err(ValidError::Custom(
                "Encryption key must be 32 bits long.".to_string(),
            ))
        }
    } else {
        // Key is optional, so this is fine
        Ok(())
    }
}

// Deserialises log level value from the config!
fn deserialize_log_level<'de, D>(deserializer: D) -> Result<tracing::Level, D::Error>
where
    D: Deserializer<'de>,
{
    let buf = String::deserialize(deserializer)?.trim().to_lowercase();

    match buf.as_str() {
        "info" => Ok(tracing::Level::INFO),
        "warn" => Ok(tracing::Level::WARN),
        "debug" => Ok(tracing::Level::DEBUG),
        "error" => Ok(tracing::Level::ERROR),
        "trace" => Ok(tracing::Level::TRACE),
        _ => Err(serde::de::Error::custom("`log_level` has an unexpected value. Please use one of: debug, error, info, warn, or trace.")),
    }
}
