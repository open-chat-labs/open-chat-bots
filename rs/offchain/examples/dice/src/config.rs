use oc_bots_sdk::mainnet::{mainnet_ic_url, mainnet_oc_public_key};
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
    pub port: u16,
}

impl Config {
    pub fn from_file(path: &str) -> Result<Self, Box<dyn Error>> {
        let content = fs::read_to_string(path)?;
        Ok(toml::from_str(&content)?)
    }
}
