use crate::errors::BotError;
use oc_bots_sdk::mainnet::{mainnet_ic_url, mainnet_oc_public_key};
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
    #[serde(default = "mainnet_ic_url")]
    pub ic_url: String,
    #[serde(default = "mainnet_oc_public_key")]
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
    #[serde(with = "serde_bytes", default)]
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

#[cfg(test)]
mod tests {
    use super::*;
    use tracing::Level;

    #[test]
    fn minimal_config_is_parsed_correctly() -> Result<(), Box<dyn std::error::Error>> {
        let config = "
            [discord]
            token = \"not-a-real-token\"
            [openchat]
            ic_url = \"http://localhost:8080\"
            public_key = \"not-a-real-public-key\"
            [openchat.bot]
            port = 13456
            private_key_path = \"nothing/to/see/here\"
            [system]
            log_level = \"info\"
        ";

        let parsed: Config = toml::from_str(config)?;

        assert_eq!(parsed.discord.token, "not-a-real-token".to_string());
        assert_eq!(parsed.openchat.ic_url, "http://localhost:8080".to_string());
        assert_eq!(
            parsed.openchat.public_key,
            "not-a-real-public-key".to_string()
        );
        assert_eq!(parsed.openchat.bot.port, 13456);
        assert_eq!(
            parsed.openchat.bot.private_key_path,
            "nothing/to/see/here".to_string()
        );
        assert_eq!(parsed.system.log_level, Level::INFO);
        assert_eq!(parsed.system.store_path, None);
        assert_eq!(parsed.system.store_encryption_key, None);

        Ok(())
    }

    #[test]
    fn full_config_is_parsed_correctly() -> Result<(), Box<dyn std::error::Error>> {
        let config = "
            [discord]
            token = \"not-a-real-token\"
            [openchat]
            ic_url = \"http://localhost:8080\"
            public_key = \"not-a-real-public-key\"
            [openchat.bot]
            port = 13456
            private_key_path = \"nothing/to/see/here\"
            [system]
            log_level = \"info\"
            store_path = \"path/to/store\"
            store_encryption_key = \"-this-is-a-valid-32-bit-enc-key-\"
        ";

        let parsed: Config = toml::from_str(config)?;

        assert_eq!(parsed.system.store_path, Some("path/to/store".to_string()));
        assert_eq!(
            parsed.system.store_encryption_key,
            Some("-this-is-a-valid-32-bit-enc-key-".as_bytes().to_vec())
        );

        Ok(())
    }

    #[test]
    fn enc_key_is_correctly_validated() -> Result<(), Box<dyn std::error::Error>> {
        let config = "
            [discord]
            token = \"not-a-real-token\"
            [openchat]
            ic_url = \"http://localhost:8080\"
            public_key = \"not-a-real-public-key\"
            [openchat.bot]
            port = 13456
            private_key_path = \"nothing/to/see/here\"
            [system]
            log_level = \"info\"
            store_path = \"path/to/store\"
            store_encryption_key = \"-this-is-a-valid-32-bit-enc-key-\"
        ";

        let parsed: Config = toml::from_str(config)?;

        assert!(parsed.system.validate().is_ok());

        Ok(())
    }

    #[test]
    fn enc_key_fails_validation() -> Result<(), Box<dyn std::error::Error>> {
        let config_with_invalid_enc_key = "
            [discord]
            token = \"not-a-real-token\"
            [openchat]
            ic_url = \"http://localhost:8080\"
            public_key = \"not-a-real-public-key\"
            [openchat.bot]
            port = 13456
            private_key_path = \"nothing/to/see/here\"
            [system]
            log_level = \"info\"
            store_path = \"path/to/store\"
            store_encryption_key = \"-this-is-definitelly-not-a-valid-32-bit-enc-key-\"
        ";

        let parsed: Config = toml::from_str(config_with_invalid_enc_key)?;

        assert!(parsed.system.validate().is_err());

        Ok(())
    }
}
