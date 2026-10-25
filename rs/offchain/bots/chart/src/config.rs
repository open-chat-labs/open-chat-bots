use anyhow::{Context, Result, anyhow, bail};
use oc_bots_sdk::mainnet::{
    mainnet_ic_url, mainnet_oc_public_key, mainnet_storage_index_canister_id,
};
use oc_bots_sdk::types::CanisterId;
use std::env;

/// From environment variables
pub struct Config {
    /// The PEM of the bot's identity, secp256k1 or Ed25519
    pub identity_pem: String,
    pub ic_url: String,
    /// OpenChat's key, which signs its commands
    pub oc_public_key: String,
    /// Where the charts are uploaded
    pub storage_index: CanisterId,
    /// A CoinGecko API key, for its higher rate limit. Without one, its public API is used.
    pub coingecko_api_key: Option<String>,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let identity_pem = match (var("OC_IDENTITY_PEM"), var("OC_IDENTITY_PEM_FILE")) {
            (Some(pem), _) => pem,
            (None, Some(file)) => std::fs::read_to_string(&file)
                .with_context(|| format!("Failed to read OC_IDENTITY_PEM_FILE {file}"))?,
            (None, None) => bail!("Set OC_IDENTITY_PEM or OC_IDENTITY_PEM_FILE"),
        };
        let storage_index = match var("OC_STORAGE_INDEX") {
            Some(text) => canister_id(&text)?,
            None => mainnet_storage_index_canister_id(),
        };

        Ok(Config {
            identity_pem,
            ic_url: var("OC_IC_URL").unwrap_or_else(mainnet_ic_url),
            // Locally it's read from Candid's text, which writes its line breaks as \n
            oc_public_key: var("OC_PUBLIC_KEY")
                .map(|key| key.replace("\\n", "\n"))
                .unwrap_or_else(mainnet_oc_public_key),
            storage_index,
            coingecko_api_key: var("COINGECKO_API_KEY"),
            port: var("PORT")
                .map_or(Ok(3000), |p| p.parse())
                .context("Invalid PORT")?,
        })
    }
}

fn var(name: &str) -> Option<String> {
    env::var(name).ok().filter(|v| !v.trim().is_empty())
}

fn canister_id(text: &str) -> Result<CanisterId> {
    ic_agent::export::Principal::from_text(text.trim())
        .map(CanisterId::from)
        .map_err(|e| anyhow!("Invalid canister id {text}: {e}"))
}
