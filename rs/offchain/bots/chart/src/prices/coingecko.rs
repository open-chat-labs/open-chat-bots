use super::{PriceError, PricePoint};
use crate::args::Period;
use crate::prices::cache::{Cache, RateLimiter};
use anyhow::anyhow;
use reqwest::StatusCode;
use serde::Deserialize;
use std::time::Duration;

const BASE_URL: &str = "https://api.coingecko.com/api/v3";
const DAY: Duration = Duration::from_secs(24 * 60 * 60);

/// CoinGecko's free API, for tokens which aren't on the Internet Computer
pub struct CoinGecko {
    http: reqwest::Client,
    api_key: Option<String>,
    rate_limiter: RateLimiter,
    top_coins: Cache<(), Vec<Coin>>,
}

/// A coin, as CoinGecko's markets list it
#[derive(Clone, Deserialize, Debug, PartialEq)]
pub struct Coin {
    pub id: String,
    pub symbol: String,
    pub name: String,
}

#[derive(Deserialize)]
struct MarketChart {
    /// [time in ms, price in USD]
    prices: Vec<(f64, f64)>,
}

impl CoinGecko {
    pub fn new(http: reqwest::Client, api_key: Option<String>) -> Self {
        // Within its limits: a Demo key's is at least 30 calls a minute, and without one it's 10 to
        // 30, shared with whoever else calls from the same address
        let limit = if api_key.is_some() { 30 } else { 10 };
        CoinGecko {
            http,
            api_key,
            rate_limiter: RateLimiter::per_minute(limit),
            top_coins: Cache::default(),
        }
    }

    /// The coin with the largest market cap which has the symbol
    pub async fn find(&self, symbol: &str) -> Result<Option<Coin>, PriceError> {
        // Most symbols asked for are among the largest coins, which saves a call for each
        if let Some(coin) = find(&self.top_coins().await?, symbol) {
            return Ok(Some(coin));
        }
        let coins: Vec<Coin> = self
            .get(
                "/coins/markets",
                &[
                    ("vs_currency", "usd"),
                    ("symbols", &symbol.to_lowercase()),
                    ("include_tokens", "top"),
                ],
            )
            .await?;
        Ok(find(&coins, symbol))
    }

    // The 250 coins with the largest market caps, largest first
    async fn top_coins(&self) -> Result<Vec<Coin>, PriceError> {
        if let Some(coins) = self.top_coins.get(&(), DAY) {
            return Ok(coins);
        }
        let coins: Vec<Coin> = self
            .get(
                "/coins/markets",
                &[
                    ("vs_currency", "usd"),
                    ("order", "market_cap_desc"),
                    ("per_page", "250"),
                ],
            )
            .await?;
        self.top_coins.insert((), coins.clone(), DAY);
        Ok(coins)
    }

    pub async fn history(&self, id: &str, period: Period) -> Result<Vec<PricePoint>, PriceError> {
        let chart: MarketChart = self
            .get(
                &format!("/coins/{id}/market_chart"),
                &[("vs_currency", "usd"), ("days", &period.days().to_string())],
            )
            .await?;
        Ok(points(chart))
    }

    async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T, PriceError> {
        if !self.rate_limiter.try_call() {
            return Err(PriceError::RateLimited("CoinGecko"));
        }
        let mut request = self.http.get(format!("{BASE_URL}{path}")).query(query);
        if let Some(key) = &self.api_key {
            request = request.header("x-cg-demo-api-key", key);
        }
        let response = request.send().await.map_err(anyhow::Error::from)?;
        match response.status() {
            StatusCode::TOO_MANY_REQUESTS => Err(PriceError::RateLimited("CoinGecko")),
            status if !status.is_success() => {
                Err(anyhow!("CoinGecko returned {status} for {path}").into())
            }
            _ => Ok(response.json().await.map_err(anyhow::Error::from)?),
        }
    }
}

// The first coin with the symbol, ie. the largest if they're in order of market cap
fn find(coins: &[Coin], symbol: &str) -> Option<Coin> {
    coins
        .iter()
        .find(|c| c.symbol.eq_ignore_ascii_case(symbol))
        .cloned()
}

// CoinGecko gives a point every 5 minutes over a day, every hour up to 90 days, and every day beyond,
// and its last point is the latest price
fn points(chart: MarketChart) -> Vec<PricePoint> {
    let mut points: Vec<PricePoint> = chart
        .prices
        .into_iter()
        .filter(|(time, price)| *time > 0.0 && price.is_finite() && *price > 0.0)
        .map(|(time, price)| PricePoint {
            time: time as u64,
            price,
        })
        .collect();
    points.sort_by_key(|p| p.time);
    points
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "calls CoinGecko"]
    async fn finds_coins_and_their_prices() {
        let coingecko = CoinGecko::new(crate::prices::http_client().unwrap(), None);
        let coin = coingecko.find("ETH").await.unwrap().unwrap();
        assert_eq!(coin.id, "ethereum");

        let points = coingecko.history(&coin.id, Period::Day).await.unwrap();
        assert!(points.len() > 200, "{} points", points.len());
        assert!(coingecko.find("NOTATOKENXYZ").await.unwrap().is_none());
    }

    #[test]
    fn market_charts_map_to_points_in_time_order() {
        let chart: MarketChart = serde_json::from_str(
            r#"{
                "prices": [[1760000000000, 5.12], [1759996400000, 5.01], [1760007200000, 5.3], [1760010800000, 0]],
                "market_caps": [[1760000000000, 1]],
                "total_volumes": [[1760000000000, 1]]
            }"#,
        )
        .unwrap();

        assert_eq!(
            points(chart),
            vec![
                PricePoint {
                    time: 1759996400000,
                    price: 5.01
                },
                PricePoint {
                    time: 1760000000000,
                    price: 5.12
                },
                PricePoint {
                    time: 1760007200000,
                    price: 5.3
                },
            ]
        );
    }

    #[test]
    fn the_largest_coin_with_the_symbol_is_found() {
        let coin = |id: &str, symbol: &str| Coin {
            id: id.to_string(),
            symbol: symbol.to_string(),
            name: id.to_string(),
        };
        let coins = vec![
            coin("bitcoin", "btc"),
            coin("tether", "usdt"),
            coin("bitcoin-bep2", "btc"),
        ];
        assert_eq!(find(&coins, "BTC"), Some(coin("bitcoin", "btc")));
        assert_eq!(find(&coins, "eth"), None);
    }

    #[test]
    fn markets_deserialize_to_coins() {
        let coins: Vec<Coin> = serde_json::from_str(
            r#"[{"id": "bitcoin", "symbol": "btc", "name": "Bitcoin", "image": "x", "current_price": 67000.1, "market_cap": 1}]"#,
        )
        .unwrap();
        assert_eq!(
            coins,
            vec![Coin {
                id: "bitcoin".to_string(),
                symbol: "btc".to_string(),
                name: "Bitcoin".to_string()
            }]
        );
    }
}
