/// A USD price to 4 significant figures, or to the cent from $1, eg. $0.002345, $5.12, $67,123
pub fn usd(price: f64) -> String {
    if price >= 1000.0 {
        format!("${}", thousands(price.round() as u64))
    } else if price >= 1.0 {
        format!("${price:.2}")
    } else if price > 0.0 {
        format!("${:.*}", decimals_for_significant_figures(price, 4), price)
    } else {
        "$0".to_string()
    }
}

/// A token's price at the start of a period and at its end, eg. $0.03113 → $0.03141
pub fn usd_range(start: f64, end: f64) -> String {
    format!("{} → {}", usd(start), usd(end))
}

/// A price on the chart's axis, with enough decimals to tell ticks `step` apart
pub fn usd_tick(price: f64, step: f64) -> String {
    if step >= 1.0 && price.abs() >= 1000.0 {
        let sign = if price < 0.0 { "-" } else { "" };
        format!("{sign}${}", thousands(price.abs().round() as u64))
    } else {
        format!("${:.*}", decimals_for_step(step), price)
    }
}

/// A change in percent, signed unless it rounds to nothing, eg. +5.2%, -12.0%, 0.0%, +1,250%
pub fn change(percent: f64) -> String {
    let magnitude = percent.abs();
    let digits = if magnitude >= 1000.0 {
        thousands(magnitude.round() as u64)
    } else {
        format!("{magnitude:.1}")
    };
    if digits == "0.0" {
        "0.0%".to_string()
    } else if percent < 0.0 {
        format!("-{digits}%")
    } else {
        format!("+{digits}%")
    }
}

/// A change on the chart's axis, eg. +10%, 0%, -2.5%
pub fn change_tick(percent: f64, step: f64) -> String {
    let rounded = format!("{:.*}", decimals_for_step(step), percent.abs());
    if rounded.trim_start_matches(['0', '.']).is_empty() {
        "0%".to_string()
    } else if percent < 0.0 {
        format!("-{rounded}%")
    } else {
        format!("+{rounded}%")
    }
}

fn decimals_for_significant_figures(value: f64, figures: i32) -> usize {
    (figures - 1 - value.abs().log10().floor() as i32).clamp(0, 12) as usize
}

fn decimals_for_step(step: f64) -> usize {
    if step <= 0.0 || !step.is_finite() {
        return 2;
    }
    // Enough for a step of eg. 2.5 to show its .5
    let decimals = -(step.log10().floor() as i32);
    let fraction = step / 10f64.powi(-decimals);
    let extra = if (fraction - fraction.round()).abs() > 1e-6 {
        1
    } else {
        0
    };
    (decimals + extra).clamp(0, 12) as usize
}

fn thousands(value: u64) -> String {
    let digits = value.to_string();
    let mut result = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            result.push(',');
        }
        result.push(c);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prices() {
        assert_eq!(usd(67123.4), "$67,123");
        assert_eq!(usd(1234567.0), "$1,234,567");
        assert_eq!(usd(5.123), "$5.12");
        assert_eq!(usd(1.0), "$1.00");
        assert_eq!(usd(0.23456), "$0.2346");
        assert_eq!(usd(0.002345), "$0.002345");
        assert_eq!(usd(0.00000123456), "$0.000001235");
        assert_eq!(usd(0.0), "$0");
    }

    #[test]
    fn price_ranges() {
        assert_eq!(usd_range(0.03113, 0.031414), "$0.03113 → $0.03141");
        assert_eq!(usd_range(67000.0, 5.5), "$67,000 → $5.50");
    }

    #[test]
    fn price_ticks() {
        assert_eq!(usd_tick(66500.0, 500.0), "$66,500");
        assert_eq!(usd_tick(5.5, 0.5), "$5.5");
        assert_eq!(usd_tick(5.0, 0.5), "$5.0");
        assert_eq!(usd_tick(0.24, 0.02), "$0.24");
        assert_eq!(usd_tick(0.225, 0.025), "$0.225");
        assert_eq!(usd_tick(0.0000125, 0.0000005), "$0.0000125");
        assert_eq!(usd_tick(10.0, 2.0), "$10");
    }

    #[test]
    fn changes() {
        assert_eq!(change(5.234), "+5.2%");
        assert_eq!(change(-12.0), "-12.0%");
        assert_eq!(change(0.0), "0.0%");
        assert_eq!(change(-0.04), "0.0%");
        assert_eq!(change(0.05), "+0.1%");
        assert_eq!(change(1250.4), "+1,250%");
    }

    #[test]
    fn change_ticks() {
        assert_eq!(change_tick(10.0, 5.0), "+10%");
        assert_eq!(change_tick(0.0, 5.0), "0%");
        assert_eq!(change_tick(-1e-12, 5.0), "0%");
        assert_eq!(change_tick(-2.5, 2.5), "-2.5%");
        assert_eq!(change_tick(-20.0, 10.0), "-20%");
    }
}
