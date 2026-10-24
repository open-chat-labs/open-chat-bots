use anyhow::{Result, anyhow};
use ic_agent::Agent;
use ic_agent::export::Principal;
use oc_bots_sdk::msgpack;
use oc_bots_sdk::types::{CanisterId, TimestampMillis};
use serde::{Deserialize, Serialize};

/// OpenChat's Registry, which lists the tokens OpenChat supports
pub const REGISTRY_CANISTER_ID: &str = "cpi5u-yiaaa-aaaar-aqw5a-cai";

/// A token OpenChat supports, whose ledger is on the Internet Computer
#[derive(Clone, Debug, PartialEq)]
pub struct ListedToken {
    pub ledger: CanisterId,
    pub symbol: String,
    pub name: String,
}

#[derive(Serialize)]
struct Args {
    since: Option<TimestampMillis>,
}

#[derive(Deserialize)]
enum Response {
    Success(SuccessResult),
    SuccessNoUpdates,
}

#[derive(Deserialize)]
struct SuccessResult {
    token_details: Option<Vec<TokenDetails>>,
}

// Only the fields used, of many
#[derive(Deserialize)]
struct TokenDetails {
    ledger_canister_id: CanisterId,
    name: String,
    symbol: String,
    enabled: bool,
}

/// The tokens OpenChat lists, from mainnet's Registry, whichever OpenChat the bot runs against, as
/// prices are only known for mainnet's tokens
pub async fn listed_tokens(agent: &Agent) -> Result<Vec<ListedToken>> {
    let registry = Principal::from_text(REGISTRY_CANISTER_ID)?;
    let bytes = agent
        .query(&registry, "updates_msgpack")
        .with_arg(msgpack::serialize_to_vec(Args { since: None })?)
        .call()
        .await?;
    let response: Response = msgpack::deserialize_from_slice(&bytes)
        .map_err(|e| anyhow!("Failed to decode the Registry's tokens: {e}"))?;
    Ok(tokens(response))
}

fn tokens(response: Response) -> Vec<ListedToken> {
    match response {
        Response::Success(result) => result
            .token_details
            .unwrap_or_default()
            .into_iter()
            .filter(|t| t.enabled)
            .map(|t| ListedToken {
                ledger: t.ledger_canister_id,
                symbol: t.symbol,
                name: t.name,
            })
            .collect(),
        Response::SuccessNoUpdates => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "calls mainnet"]
    async fn lists_mainnets_tokens() {
        let agent = Agent::builder()
            .with_url(oc_bots_sdk::mainnet::mainnet_ic_url())
            .build()
            .unwrap();
        let tokens = listed_tokens(&agent).await.unwrap();
        assert!(tokens.iter().any(|t| t.symbol == "CHAT"));
        assert!(tokens.iter().any(|t| t.symbol == "ckBTC"));
    }

    #[derive(Serialize)]
    enum FullResponse {
        Success(FullResult),
    }

    // As the Registry sends it, with more fields than are read
    #[derive(Serialize)]
    struct FullResult {
        last_updated: TimestampMillis,
        token_details: Option<Vec<FullTokenDetails>>,
        tokens_uninstalled: Option<Vec<CanisterId>>,
        swap_providers: Option<Vec<String>>,
    }

    #[derive(Serialize)]
    struct FullTokenDetails {
        ledger_canister_id: CanisterId,
        name: String,
        symbol: String,
        decimals: u8,
        logo: String,
        enabled: bool,
    }

    fn token(ledger: &str, symbol: &str, enabled: bool) -> FullTokenDetails {
        FullTokenDetails {
            ledger_canister_id: Principal::from_text(ledger).unwrap().into(),
            name: format!("{symbol} token"),
            symbol: symbol.to_string(),
            decimals: 8,
            logo: String::new(),
            enabled,
        }
    }

    #[test]
    fn the_registrys_enabled_tokens_are_listed() {
        let bytes = msgpack::serialize_to_vec(FullResponse::Success(FullResult {
            last_updated: 1,
            token_details: Some(vec![
                token("2ouva-viaaa-aaaaq-aaamq-cai", "CHAT", true),
                token("ryjl3-tyaaa-aaaaa-aaaba-cai", "OLD", false),
            ]),
            tokens_uninstalled: None,
            swap_providers: None,
        }))
        .unwrap();
        let response: Response = msgpack::deserialize_from_slice(&bytes).unwrap();

        assert_eq!(
            tokens(response),
            vec![ListedToken {
                ledger: Principal::from_text("2ouva-viaaa-aaaaq-aaamq-cai")
                    .unwrap()
                    .into(),
                symbol: "CHAT".to_string(),
                name: "CHAT token".to_string(),
            }]
        );
    }
}
