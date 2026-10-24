use crate::args::Period;
use crate::format;
use crate::prices::PricePoint;
use ab_glyph::{Font, FontRef, PxScale, ScaleFont};
use anyhow::{Result, anyhow};
use chrono::{DateTime, Utc};
use plotters::coord::Shift;
use plotters::prelude::*;
use plotters::style::{FontStyle, register_font};
use resvg::{tiny_skia, usvg};
use std::sync::{Arc, LazyLock, Once};

// Drawn at twice the size OpenChat shows it, so it's sharp on high density screens
pub const WIDTH: u32 = 1200;
pub const HEIGHT: u32 = 675;
const PADDING: i32 = 48;
const HEADER_HEIGHT: u32 = 150;
const FOOTER_HEIGHT: u32 = 56;

const FONT: &str = "sans-serif";

// Dark, as price charts usually are. The series colors are the first five slots of a categorical
// palette, in an order checked for colour blindness against this surface.
const SURFACE: RGBColor = RGBColor(0x1a, 0x1a, 0x19);
const INK: RGBColor = RGBColor(0xf0, 0xef, 0xec);
const SECONDARY_INK: RGBColor = RGBColor(0xc3, 0xc2, 0xb7);
const MUTED_INK: RGBColor = RGBColor(0x89, 0x87, 0x81);
const GRIDLINE: RGBColor = RGBColor(0x2c, 0x2c, 0x2a);
const BASELINE: RGBColor = RGBColor(0x38, 0x38, 0x35);
const UP: RGBColor = RGBColor(0x0c, 0xa3, 0x0c);
const DOWN: RGBColor = RGBColor(0xe6, 0x67, 0x67);
const SERIES: [RGBColor; 5] = [
    RGBColor(0x39, 0x87, 0xe5),
    RGBColor(0xd9, 0x59, 0x26),
    RGBColor(0x19, 0x9e, 0x70),
    RGBColor(0xc9, 0x85, 0x00),
    RGBColor(0xd5, 0x51, 0x81),
];

pub struct Line<'a> {
    pub symbol: &'a str,
    pub name: &'a str,
    /// In time order, within the period
    pub points: &'a [PricePoint],
}

/// Draws the lines as a PNG. One line is drawn as its price in USD. Several are drawn as their
/// change since the start of the period, so they share an axis.
pub fn render(lines: &[Line], period: Period, sources: &[&str]) -> Result<Vec<u8>> {
    if lines.is_empty() || lines.len() > SERIES.len() || lines.iter().any(|l| l.points.len() < 2) {
        return Err(anyhow!("Can't chart {} lines", lines.len()));
    }
    register_fonts();

    let mut svg = String::new();
    {
        let root = SVGBackend::with_string(&mut svg, (WIDTH, HEIGHT)).into_drawing_area();
        root.fill(&SURFACE).map_err(error)?;
        let (header, rest) = root.split_vertically(HEADER_HEIGHT);
        let (plot, footer) = rest.split_vertically(HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT);

        let as_change = lines.len() > 1;
        if as_change {
            draw_legend(&header, lines, period)?;
        } else {
            draw_title(&header, &lines[0], period)?;
        }
        draw_plot(&plot, lines, as_change)?;
        draw_footer(&footer, sources)?;
        root.present().map_err(error)?;
    }

    rasterize(&svg)
}

// plotters draws text on bitmaps without each glyph's side bearing, which spaces letters unevenly,
// so it draws an SVG which resvg draws instead
fn rasterize(svg: &str) -> Result<Vec<u8>> {
    let options = usvg::Options {
        fontdb: FONTS.clone(),
        ..usvg::Options::default()
    };
    let tree = usvg::Tree::from_str(svg, &options)?;
    let mut pixmap =
        tiny_skia::Pixmap::new(WIDTH, HEIGHT).ok_or_else(|| anyhow!("Invalid chart size"))?;
    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    Ok(pixmap.encode_png()?)
}

// For resvg, which draws the text
static FONTS: LazyLock<Arc<usvg::fontdb::Database>> = LazyLock::new(|| {
    let mut fonts = usvg::fontdb::Database::new();
    fonts.load_font_data(font_data(FontStyle::Normal).to_vec());
    fonts.load_font_data(font_data(FontStyle::Bold).to_vec());
    fonts.set_sans_serif_family("DejaVu Sans");
    Arc::new(fonts)
});

/// The change from the line's first point to its last, in percent
pub fn change(points: &[PricePoint]) -> Option<f64> {
    let (first, last) = (points.first()?, points.last()?);
    (first.price > 0.0).then(|| (last.price / first.price - 1.0) * 100.0)
}

fn draw_title(area: &DrawingArea<SVGBackend, Shift>, line: &Line, period: Period) -> Result<()> {
    let last = line.points.last().unwrap().price;
    let title = format!("{} {}", line.symbol, format::usd(last));
    let title_style = font(44, FontStyle::Bold).color(&INK);
    area.draw_text(&title, &title_style, (PADDING, 40))
        .map_err(error)?;

    if let Some(change) = change(line.points) {
        let width = text_width(&title, 44, FontStyle::Bold);
        draw_change(area, change, (PADDING + width + 24, 48), 36)?;
    }

    let subtitle = if line.name.eq_ignore_ascii_case(line.symbol) {
        format!("USD · past {period}")
    } else {
        format!("{} · USD · past {period}", line.name)
    };
    area.draw_text(
        &subtitle,
        &font(28, FontStyle::Normal).color(&SECONDARY_INK),
        (PADDING, 100),
    )
    .map_err(error)
}

fn draw_legend(
    area: &DrawingArea<SVGBackend, Shift>,
    lines: &[Line],
    period: Period,
) -> Result<()> {
    area.draw_text(
        &format!("Change over the past {period}"),
        &font(36, FontStyle::Bold).color(&INK),
        (PADDING, 34),
    )
    .map_err(error)?;

    let label_style = font(28, FontStyle::Normal).color(&SECONDARY_INK);
    let mut x = PADDING;
    let y = 104;
    for (line, color) in lines.iter().zip(SERIES) {
        area.draw(&PathElement::new(
            vec![(x, y), (x + 28, y)],
            color.stroke_width(6),
        ))
        .map_err(error)?;
        x += 40;

        let label = match change(line.points) {
            Some(change) => format!("{} {}", line.symbol, format::change(change)),
            None => line.symbol.to_string(),
        };
        area.draw_text(&label, &label_style, (x, y - 15))
            .map_err(error)?;
        x += text_width(&label, 28, FontStyle::Normal) + 36;
    }
    Ok(())
}

fn draw_change(
    area: &DrawingArea<SVGBackend, Shift>,
    change: f64,
    position: (i32, i32),
    size: u32,
) -> Result<()> {
    let text = format::change(change);
    // The arrow says which way it went as well as the colour
    let (text, color) = match text.chars().next() {
        Some('+') => (format!("▲ {text}"), UP),
        Some('-') => (format!("▼ {text}"), DOWN),
        _ => (text, SECONDARY_INK),
    };
    area.draw_text(&text, &font(size, FontStyle::Bold).color(&color), position)
        .map_err(error)
}

fn draw_plot(area: &DrawingArea<SVGBackend, Shift>, lines: &[Line], as_change: bool) -> Result<()> {
    let series: Vec<Vec<(DateTime<Utc>, f64)>> = lines
        .iter()
        .map(|line| {
            let first = line.points[0].price;
            line.points
                .iter()
                .filter_map(|p| {
                    let value = if as_change {
                        (p.price / first - 1.0) * 100.0
                    } else {
                        p.price
                    };
                    Some((DateTime::from_timestamp_millis(p.time as i64)?, value))
                })
                .collect()
        })
        .collect();

    let start = series
        .iter()
        .filter_map(|s| s.first())
        .map(|p| p.0)
        .min()
        .unwrap();
    let end = series
        .iter()
        .filter_map(|s| s.last())
        .map(|p| p.0)
        .max()
        .unwrap();
    let values = series.iter().flatten().map(|p| p.1);
    let (mut min, mut max) =
        values.fold((f64::MAX, f64::MIN), |(lo, hi), v| (lo.min(v), hi.max(v)));
    if as_change {
        // The baseline is always shown
        min = min.min(0.0);
        max = max.max(0.0);
    }
    let margin = ((max - min) * 0.08)
        .max(max.abs() * 0.001)
        .max(f64::MIN_POSITIVE);
    let (y_min, y_max) = (min - margin, max + margin);
    let y_min = if as_change { y_min } else { y_min.max(0.0) };
    let step = tick_step(y_max - y_min);

    let mut chart = ChartBuilder::on(area)
        .margin_left(PADDING as u32 / 2)
        .margin_right(PADDING as u32)
        .margin_top(8)
        .x_label_area_size(56)
        .y_label_area_size(150)
        .build_cartesian_2d(start..end, y_min..y_max)
        .map_err(error)?;

    let label_style = font(26, FontStyle::Normal).color(&MUTED_INK);
    let span = end - start;
    chart
        .configure_mesh()
        .disable_x_mesh()
        .light_line_style(TRANSPARENT)
        .bold_line_style(GRIDLINE.stroke_width(2))
        // The gridlines show the values, and the baseline's drawn below. The ticks are only there
        // as plotters spaces the labels from the axis by them.
        .axis_style(TRANSPARENT)
        .set_all_tick_mark_size(6)
        .x_labels(6)
        .y_labels(6)
        .x_label_style(label_style.clone())
        .y_label_style(label_style)
        .x_label_formatter(&|time| format_time(time, span))
        .y_label_formatter(&|value| {
            if as_change {
                format::change_tick(*value, step)
            } else {
                format::usd_tick(*value, step)
            }
        })
        .draw()
        .map_err(error)?;

    let baseline = if as_change { 0.0 } else { y_min };
    chart
        .draw_series(LineSeries::new(
            [(start, baseline), (end, baseline)],
            BASELINE.stroke_width(2),
        ))
        .map_err(error)?;

    // The first token is drawn last, so it's on top
    for (points, color) in series.iter().zip(SERIES).rev() {
        chart
            .draw_series(LineSeries::new(
                points.iter().copied(),
                color.stroke_width(4),
            ))
            .map_err(error)?;

        // A dot at the latest price, with a ring of the surface so it stands out where lines cross
        let last = *points.last().unwrap();
        chart
            .draw_series([
                Circle::new(last, 12, SURFACE.filled()),
                Circle::new(last, 8, color.filled()),
            ])
            .map_err(error)?;
    }
    Ok(())
}

fn draw_footer(area: &DrawingArea<SVGBackend, Shift>, sources: &[&str]) -> Result<()> {
    if sources.is_empty() {
        return Ok(());
    }
    let text = format!("Prices from {}", sources.join(", "));
    let style = font(24, FontStyle::Normal).color(&MUTED_INK);
    let width = text_width(&text, 24, FontStyle::Normal);
    area.draw_text(&text, &style, (WIDTH as i32 - PADDING - width, 8))
        .map_err(error)
}

fn format_time(time: &DateTime<Utc>, span: chrono::TimeDelta) -> String {
    let format = if span <= chrono::TimeDelta::days(2) {
        "%H:%M"
    } else if span <= chrono::TimeDelta::days(100) {
        "%b %-d"
    } else {
        "%b %Y"
    };
    time.format(format).to_string()
}

// Roughly the distance between the axis' ticks, which plotters places at round values, so their
// labels have enough decimals to tell them apart
fn tick_step(range: f64) -> f64 {
    let rough = range / 6.0;
    let magnitude = 10f64.powf(rough.log10().floor());
    [1.0, 2.0, 5.0, 10.0]
        .into_iter()
        .map(|m| m * magnitude)
        .find(|step| *step >= rough)
        .unwrap_or(magnitude * 10.0)
}

// The width of the text as resvg draws it. plotters' own estimate is for a larger size than its SVG
// backend writes, which is the size / 1.24.
fn text_width(text: &str, size: u32, style: FontStyle) -> i32 {
    let font = FontRef::try_from_slice(font_data(style)).unwrap();
    let em = size as f32 / 1.24;
    // ab_glyph scales by the font's height rather than its em
    let height_per_em = font.height_unscaled() / font.units_per_em().unwrap_or(2048.0);
    let font = font.as_scaled(PxScale::from(em * height_per_em));

    let mut width = 0.0;
    let mut previous = None;
    for c in text.chars() {
        let glyph = font.glyph_id(c);
        if let Some(previous) = previous {
            width += font.kern(previous, glyph);
        }
        width += font.h_advance(glyph);
        previous = Some(glyph);
    }
    width.round() as i32
}

fn font_data(style: FontStyle) -> &'static [u8] {
    match style {
        FontStyle::Bold => dejavu::sans::bold(),
        _ => dejavu::sans::regular(),
    }
}

fn font(size: u32, style: FontStyle) -> TextStyle<'static> {
    TextStyle::from((FONT, size, style))
}

// For plotters, which measures the text to lay it out
fn register_fonts() {
    static REGISTER: Once = Once::new();
    REGISTER.call_once(|| {
        register_font(FONT, FontStyle::Normal, font_data(FontStyle::Normal))
            .and_then(|_| register_font(FONT, FontStyle::Bold, font_data(FontStyle::Bold)))
            .unwrap_or_else(|_| panic!("DejaVu Sans can't be read"));
    });
}

fn error<E: std::error::Error + Send + Sync>(error: DrawingAreaErrorKind<E>) -> anyhow::Error {
    anyhow!("Failed to draw the chart: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn points(prices: &[f64], interval: u64) -> Vec<PricePoint> {
        let start = 1_760_000_000_000;
        prices
            .iter()
            .enumerate()
            .map(|(i, price)| PricePoint {
                time: start + i as u64 * interval,
                price: *price,
            })
            .collect()
    }

    fn wave(count: usize, base: f64, amplitude: f64) -> Vec<f64> {
        (0..count)
            .map(|i| base * (1.0 + amplitude * ((i as f64) / 9.0).sin() + i as f64 * 0.002))
            .collect()
    }

    fn assert_is_png(png: &[u8]) {
        let image = image::load_from_memory_with_format(png, image::ImageFormat::Png).unwrap();
        assert_eq!((image.width(), image.height()), (WIDTH, HEIGHT));
    }

    // Set CHART_OUTPUT_DIR to look at them
    fn save(name: &str, png: &[u8]) {
        if let Ok(dir) = std::env::var("CHART_OUTPUT_DIR") {
            std::fs::write(format!("{dir}/{name}.png"), png).unwrap();
        }
    }

    #[test]
    fn renders_one_token_as_its_price() {
        let prices = points(&wave(168, 0.23, 0.08), 3_600_000);
        let png = render(
            &[Line {
                symbol: "CHAT",
                name: "OpenChat",
                points: &prices,
            }],
            Period::Week,
            &["ICPSwap"],
        )
        .unwrap();
        assert_is_png(&png);
        save("one", &png);
    }

    #[test]
    fn renders_several_tokens_as_their_change() {
        let chat = points(&wave(90, 0.23, 0.1), 86_400_000);
        let icp = points(&wave(90, 5.1, -0.05), 86_400_000);
        let btc = points(&wave(90, 67_000.0, 0.03), 86_400_000);
        let png = render(
            &[
                Line {
                    symbol: "CHAT",
                    name: "OpenChat",
                    points: &chat,
                },
                Line {
                    symbol: "ICP",
                    name: "Internet Computer",
                    points: &icp,
                },
                Line {
                    symbol: "ckBTC",
                    name: "ckBTC",
                    points: &btc,
                },
            ],
            Period::Quarter,
            &["ICPSwap", "CoinGecko"],
        )
        .unwrap();
        assert_is_png(&png);
        save("several", &png);
    }

    #[test]
    fn renders_a_flat_line() {
        let prices = points(&[1.0; 24], 3_600_000);
        let png = render(
            &[Line {
                symbol: "ckUSDC",
                name: "ckUSDC",
                points: &prices,
            }],
            Period::Day,
            &[],
        )
        .unwrap();
        assert_is_png(&png);
        save("flat", &png);
    }

    #[test]
    fn needs_at_least_two_points() {
        let prices = points(&[1.0], 3_600_000);
        let line = Line {
            symbol: "X",
            name: "X",
            points: &prices,
        };
        assert!(render(&[line], Period::Day, &[]).is_err());
    }

    #[test]
    fn change_is_from_the_first_point_to_the_last() {
        let prices = points(&[2.0, 5.0, 3.0], 1);
        assert_eq!(change(&prices), Some(50.0));
        assert_eq!(change(&points(&[0.0, 1.0], 1)), None);
    }
}
