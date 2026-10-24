use std::fmt::{Display, Formatter};

/// More lines than this are hard to tell apart
pub const MAX_TOKENS: usize = 5;
const MAX_SYMBOL_LENGTH: usize = 20;

/// What `/chart` was asked for. OpenChat passes everything typed after `/chart` as one string, as
/// it only does that for a command with a single string parameter, eg. `CHAT ICP ckBTC 30d`.
#[derive(Debug, PartialEq)]
pub struct ChartArgs {
    pub symbols: Vec<String>,
    pub period: Period,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Period {
    Day,
    Week,
    Month,
    Quarter,
    Year,
}

impl Period {
    pub const DEFAULT: Period = Period::Week;

    fn parse(text: &str) -> Option<Period> {
        match text.to_ascii_lowercase().as_str() {
            "1d" | "24h" | "day" => Some(Period::Day),
            "7d" | "1w" | "week" => Some(Period::Week),
            "30d" | "1m" | "month" => Some(Period::Month),
            "90d" | "3m" => Some(Period::Quarter),
            "1y" | "12m" | "365d" | "year" => Some(Period::Year),
            _ => None,
        }
    }

    pub fn days(self) -> u32 {
        match self {
            Period::Day => 1,
            Period::Week => 7,
            Period::Month => 30,
            Period::Quarter => 90,
            Period::Year => 365,
        }
    }

    pub fn millis(self) -> u64 {
        self.days() as u64 * 24 * 60 * 60 * 1000
    }

    /// How it's written in the caption, eg. the 7d in "CHAT $0.2345 (+5.2% 7d)"
    pub fn short(self) -> &'static str {
        match self {
            Period::Day => "24h",
            Period::Week => "7d",
            Period::Month => "30d",
            Period::Quarter => "90d",
            Period::Year => "1y",
        }
    }
}

// As in "the past 7 days"
impl Display for Period {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Period::Day => "24 hours",
            Period::Week => "7 days",
            Period::Month => "30 days",
            Period::Quarter => "90 days",
            Period::Year => "year",
        })
    }
}

pub fn parse(text: &str) -> Result<ChartArgs, String> {
    let mut symbols: Vec<String> = Vec::new();
    let mut period = None;

    for word in text
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|w| !w.is_empty())
    {
        if let Some(p) = Period::parse(word) {
            if period.replace(p).is_some_and(|previous| previous != p) {
                return Err("Give at most one period, eg. 30d.".to_string());
            }
            continue;
        }

        // People often write $CHAT
        let symbol = word.strip_prefix('$').unwrap_or(word);
        if symbol.is_empty()
            || symbol.len() > MAX_SYMBOL_LENGTH
            || !symbol
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        {
            return Err(format!("\"{word}\" isn't a token symbol."));
        }
        if !symbols.iter().any(|s| s.eq_ignore_ascii_case(symbol)) {
            symbols.push(symbol.to_string());
        }
    }

    if symbols.is_empty() {
        return Err(usage());
    }
    if symbols.len() > MAX_TOKENS {
        return Err(format!("Chart at most {MAX_TOKENS} tokens at once."));
    }

    Ok(ChartArgs {
        symbols,
        period: period.unwrap_or(Period::DEFAULT),
    })
}

pub fn usage() -> String {
    "Give one or more token symbols, then optionally a period (1d, 7d, 30d, 90d or 1y), \
    eg. `/chart CHAT ICP 30d`."
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn symbols(args: &ChartArgs) -> Vec<&str> {
        args.symbols.iter().map(|s| s.as_str()).collect()
    }

    #[test]
    fn one_token_defaults_to_a_week() {
        let args = parse("CHAT").unwrap();
        assert_eq!(symbols(&args), ["CHAT"]);
        assert_eq!(args.period, Period::Week);
    }

    #[test]
    fn several_tokens_and_a_period() {
        let args = parse("CHAT ICP ckBTC 30d").unwrap();
        assert_eq!(symbols(&args), ["CHAT", "ICP", "ckBTC"]);
        assert_eq!(args.period, Period::Month);
    }

    #[test]
    fn the_period_can_go_anywhere() {
        assert_eq!(parse("1y CHAT").unwrap().period, Period::Year);
        assert_eq!(parse("CHAT 1D ICP").unwrap().period, Period::Day);
    }

    #[test]
    fn periods_have_aliases() {
        for (text, period) in [
            ("24h", Period::Day),
            ("1w", Period::Week),
            ("1m", Period::Month),
            ("3m", Period::Quarter),
            ("90d", Period::Quarter),
            ("12m", Period::Year),
            ("365d", Period::Year),
        ] {
            assert_eq!(
                parse(&format!("ICP {text}")).unwrap().period,
                period,
                "{text}"
            );
        }
    }

    #[test]
    fn commas_dollar_signs_and_extra_spaces_are_ignored() {
        let args = parse("  $CHAT,ICP ,  ckBTC  ").unwrap();
        assert_eq!(symbols(&args), ["CHAT", "ICP", "ckBTC"]);
    }

    #[test]
    fn repeated_tokens_are_charted_once() {
        let args = parse("CHAT chat ICP CHAT").unwrap();
        assert_eq!(symbols(&args), ["CHAT", "ICP"]);
    }

    #[test]
    fn the_same_period_twice_is_fine_but_two_periods_are_not() {
        assert_eq!(parse("CHAT 7d 1w").unwrap().period, Period::Week);
        assert!(parse("CHAT 7d 30d").is_err());
    }

    #[test]
    fn at_least_one_token_is_needed() {
        assert_eq!(parse(""), Err(usage()));
        assert_eq!(parse("30d"), Err(usage()));
        assert_eq!(parse(" , "), Err(usage()));
    }

    #[test]
    fn at_most_five_tokens() {
        assert!(parse("A B C D E").is_ok());
        assert!(parse("A B C D E F").is_err());
    }

    #[test]
    fn symbols_are_checked() {
        assert!(parse("CH@T").is_err());
        assert!(parse("$").is_err());
        assert!(parse("ABCDEFGHIJKLMNOPQRSTU").is_err());
        assert!(parse("ck.BTC wstETH BTC-B").is_ok());
    }
}
