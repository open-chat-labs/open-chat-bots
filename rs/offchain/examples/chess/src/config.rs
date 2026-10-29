use oc_bots_sdk::mainnet::{mainnet_ic_url, mainnet_oc_public_key, mainnet_user_index_canister_id};
use oc_bots_sdk::types::CanisterId;
use serde::Deserialize;
use std::error::Error;
use std::fs;

#[derive(Deserialize, Debug)]
pub struct Config {
    pub pem_file: String,
    #[serde(default = "mainnet_ic_url")]
    pub ic_url: String,
    #[serde(default = "mainnet_oc_public_key")]
    pub oc_public_key: String,
    /// Where the bot looks up the user id OpenChat gave it, and where it's installed
    #[serde(default = "mainnet_user_index_canister_id")]
    pub user_index_canister_id: CanisterId,
    /// OpenChat's MiniApp service, which posts the bot's cards and records its games
    #[serde(default = "default_mini_app_service_url")]
    pub mini_app_service_url: String,
    pub port: u16,
}

fn default_mini_app_service_url() -> String {
    "http://localhost:8095".to_string()
}

impl Config {
    pub fn from_file(path: &str) -> Result<Self, Box<dyn Error>> {
        let content = fs::read_to_string(path)?;
        Ok(toml::from_str(&content)?)
    }
}
