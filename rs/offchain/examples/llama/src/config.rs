use crate::errors::BotError;
use oc_bots_sdk::consts::{IC_URL, OC_PUBLIC_KEY};
use serde::de::Deserializer;
use serde::Deserialize;
use std::fs;
use tracing::Level;

#[derive(Deserialize, Debug)]
pub struct Config {
    pub pem_file: String,
    #[serde(default = "mainnet_ic_url")]
    pub ic_url: String,
    #[serde(default = "mainnet_oc_public_key")]
    pub oc_public_key: String,
    pub port: u16,
    #[serde(deserialize_with = "deserialize_log_level")]
    pub log_level: Level,
}

impl Config {
    pub fn from_file(path: &str) -> Result<Self, BotError> {
        let content = fs::read_to_string(path).map_err(BotError::ConfigFileError)?;
        Ok(toml::from_str(&content)?)
    }
}

fn deserialize_log_level<'de, D>(deserializer: D) -> Result<Level, D::Error>
where
    D: Deserializer<'de>,
{
    let buf = String::deserialize(deserializer)?.trim().to_lowercase();

    match buf.as_str() {
        "trace" => Ok(Level::TRACE),
        "debug" => Ok(Level::DEBUG),
        "info" => Ok(Level::INFO),
        "warn" => Ok(Level::WARN),
        "error" => Ok(Level::ERROR),
        _ => Err(serde::de::Error::custom("`log_level` has an unexpected value. Please use one of: trace, debug, info, warn, or error.")),
    }
}

fn mainnet_ic_url() -> String {
    IC_URL.to_string()
}

fn mainnet_oc_public_key() -> String {
    OC_PUBLIC_KEY.to_string()
}
