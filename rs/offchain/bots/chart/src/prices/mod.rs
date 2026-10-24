use crate::args::Period;
use anyhow::Result;
use cache::Cache;
use coingecko::CoinGecko;
use ic_agent::Agent;
use icpswap::IcpSwap;
use oc_bots_sdk::mainnet::mainnet_ic_url;
use oc_bots_sdk::types::{CanisterId, TimestampMillis};
use registry::ListedToken;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

mod cache;
mod coingecko;
mod icpswap;
mod registry;

const HOUR: Duration = Duration::from_secs(60 * 60);

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PricePoint {
    pub time: TimestampMillis,
    /// In USD
    pub price: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Token {
    /// As its source writes it, eg. ckBTC
    pub symbol: String,
    pub name: String,
    pub source: Source,
}

/// Where a token's prices come from
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Source {
    /// A token on the Internet Computer, by its ledger
    Icp(CanisterId),
    /// Any other token, by its CoinGecko id
    CoinGecko(String),
}

impl Source {
    pub fn name(&self) -> &'static str {
        match self {
            Source::Icp(_) => "ICPSwap",
            Source::CoinGecko(_) => "CoinGecko",
        }
    }
}

#[derive(Debug)]
pub enum PriceError {
    /// The source is getting too many requests, from the bot or from others
    RateLimited(&'static str),
    Other(anyhow::Error),
}

impl From<anyhow::Error> for PriceError {
    fn from(error: anyhow::Error) -> Self {
        PriceError::Other(error)
    }
}

pub struct Prices {
    // Anonymous, for mainnet's Registry
    mainnet: Agent,
    coingecko: CoinGecko,
    icpswap: IcpSwap,
    listed: Cache<(), Vec<ListedToken>>,
    found: Cache<String, Option<Token>>,
    histories: Cache<(Source, Period), Vec<PricePoint>>,
}

impl Prices {
    pub fn new(coingecko_api_key: Option<String>) -> Result<Self> {
        let http = http_client()?;

        Ok(Prices {
            mainnet: Agent::builder().with_url(mainnet_ic_url()).build()?,
            coingecko: CoinGecko::new(http.clone(), coingecko_api_key),
            icpswap: IcpSwap::new(http),
            listed: Cache::default(),
            found: Cache::default(),
            histories: Cache::default(),
        })
    }

    /// The token the symbol most likely means: one OpenChat lists, else the one with the largest
    /// market cap on CoinGecko
    pub async fn find(&self, symbol: &str) -> Result<Option<Token>, PriceError> {
        let key = symbol.to_lowercase();
        if let Some(token) = self.found.get(&key, HOUR) {
            return Ok(token);
        }

        let token = match find_listed(&self.listed_tokens().await?, symbol) {
            Some(token) => Some(token),
            None => self.coingecko.find(symbol).await?.map(|coin| Token {
                symbol: coin.symbol.to_uppercase(),
                name: coin.name,
                source: Source::CoinGecko(coin.id),
            }),
        };

        self.found.insert(key, token.clone(), HOUR);
        Ok(token)
    }

    /// The token's prices over the period, oldest first, the last being the latest
    pub async fn history(
        &self,
        token: &Token,
        period: Period,
    ) -> Result<Vec<PricePoint>, PriceError> {
        let key = (token.source.clone(), period);
        let max_age = cache_duration(period);
        if let Some(points) = self.histories.get(&key, max_age) {
            return Ok(points);
        }

        let points = match &token.source {
            Source::Icp(ledger) => self.icpswap.history(*ledger, period).await?,
            Source::CoinGecko(id) => self.coingecko.history(id, period).await?,
        };
        let points = within_period(points, period, now());

        self.histories.insert(key, points.clone(), max_age);
        Ok(points)
    }

    async fn listed_tokens(&self) -> Result<Vec<ListedToken>, PriceError> {
        if let Some(tokens) = self.listed.get(&(), HOUR) {
            return Ok(tokens);
        }
        let tokens = registry::listed_tokens(&self.mainnet).await?;
        self.listed.insert((), tokens.clone(), HOUR);
        Ok(tokens)
    }
}

fn http_client() -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        // CoinGecko refuses requests without one
        .user_agent("OpenChat ChartBot")
        .build()
}

fn find_listed(tokens: &[ListedToken], symbol: &str) -> Option<Token> {
    tokens
        .iter()
        .find(|t| t.symbol.eq_ignore_ascii_case(symbol))
        .map(|t| Token {
            symbol: t.symbol.clone(),
            name: t.name.clone(),
            source: Source::Icp(t.ledger),
        })
}

// Recent periods are cached more briefly, as their latest price matters more
fn cache_duration(period: Period) -> Duration {
    match period {
        Period::Day => Duration::from_secs(5 * 60),
        Period::Week => Duration::from_secs(15 * 60),
        _ => HOUR,
    }
}

// The points within the period. The price at its start is the last one before it, if there is one,
// as a token which trades rarely may not have traded for a while.
fn within_period(points: Vec<PricePoint>, period: Period, now: TimestampMillis) -> Vec<PricePoint> {
    let start = now.saturating_sub(period.millis());
    let before = points
        .iter()
        .rev()
        .find(|p| p.time < start)
        .map(|p| PricePoint {
            time: start,
            price: p.price,
        });
    before
        .into_iter()
        .chain(points.into_iter().filter(|p| p.time >= start))
        .collect()
}

fn now() -> TimestampMillis {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as TimestampMillis
}

#[cfg(test)]
mod tests {
    use super::*;
    use ic_agent::export::Principal;

    #[test]
    fn listed_tokens_are_found_ignoring_case() {
        let chat = Principal::from_text("2ouva-viaaa-aaaaq-aaamq-cai")
            .unwrap()
            .into();
        let tokens = vec![ListedToken {
            ledger: chat,
            symbol: "ckBTC".to_string(),
            name: "ckBTC".to_string(),
        }];

        let token = find_listed(&tokens, "CKBTC").unwrap();
        assert_eq!(token.symbol, "ckBTC");
        assert_eq!(token.source, Source::Icp(chat));
        assert!(find_listed(&tokens, "BTC").is_none());
    }

    fn point(time: TimestampMillis, price: f64) -> PricePoint {
        PricePoint { time, price }
    }

    #[test]
    fn the_period_starts_at_the_last_price_before_it() {
        let day = Period::Day.millis();
        let now = 10 * day;
        let points = vec![
            point(now - day - 2, 1.0),
            point(now - day - 1, 2.0),
            point(now - 10, 3.0),
            point(now, 4.0),
        ];
        assert_eq!(
            within_period(points, Period::Day, now),
            vec![point(now - day, 2.0), point(now - 10, 3.0), point(now, 4.0)]
        );
    }

    #[test]
    fn a_point_at_the_start_of_the_period_is_kept() {
        let day = Period::Day.millis();
        let points = vec![point(9 * day, 2.0), point(10 * day, 3.0)];
        assert_eq!(within_period(points.clone(), Period::Day, 10 * day), points);
    }
}
