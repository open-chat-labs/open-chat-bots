use futures::FutureExt;
use futures::future::{BoxFuture, Shared};
use oc_bots_sdk::types::{OgPreview, OgPreviewImage};
use regex::Regex;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use url::Url;

/// The OpenGraph preview service used by the OpenChat web client.
pub const DEFAULT_PREVIEW_PROXY_URL: &str = "https://dy7sqxe9if6te.cloudfront.net";

/// The most previews we will attach to a single message, matching the OpenChat web client.
pub const MAX_LINK_PREVIEWS: usize = 3;

const PREVIEW_TIMEOUT: Duration = Duration::from_secs(5);

// Bots typically fan the *same* message out to many chats, so without a cache we would ask the
// preview service for the same url once per recipient. The in-flight future is cached (not just
// the resolved value) so that concurrent sends of the same url coalesce into a single request.
const MAX_CACHE_ENTRIES: usize = 500;
const CACHE_TTL: Duration = Duration::from_secs(10 * 60); // a successful lookup
const NEGATIVE_CACHE_TTL: Duration = Duration::from_secs(30); // a failure, so a blip is retried

const LINK_REMOVED: &str = "#LINK_REMOVED";

// Originally taken from here - https://stackoverflow.com/a/6041965
static URL_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(https?)://(localhost|[\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])",
    )
    .expect("invalid url regex")
});

// Matches a markdown link so that we can replace it with just its destination. Bots very often
// post markdown links rather than bare urls, so this is the common case not the edge case.
static MARKDOWN_LINK_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[[^\]]*\]\((https?://[^)]*)\)").expect("invalid markdown regex")
});

static OC_COMMUNITY_MESSAGE_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)/community/([a-z0-9_-]+)/channel/(\d+)/(\d+)").expect("invalid oc regex")
});

static OC_GROUP_MESSAGE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)/group/([a-z0-9_-]+)/(\d+)").expect("invalid oc regex"));

// The shape returned by the preview service. Note that these are camelCase.
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct OgData {
    title: Option<String>,
    description: Option<String>,
    image: Option<String>,
    image_width: Option<u32>,
    image_height: Option<u32>,
}

fn is_oc_url(url: &Url) -> bool {
    match url.host_str() {
        Some(host) => host == "oc.app" || host.ends_with(".oc.app") || host == "localhost",
        None => false,
    }
}

// Returns true if this url points at a message *within* OpenChat. The OpenChat client renders
// those with its own inline preview so we must not ask the preview service about them.
fn is_oc_message_url(url_text: &str) -> bool {
    let Ok(url) = Url::parse(url_text) else {
        return false;
    };
    if !is_oc_url(&url) {
        return false;
    }
    OC_COMMUNITY_MESSAGE_REGEX.is_match(url.path()) || OC_GROUP_MESSAGE_REGEX.is_match(url.path())
}

/// Extracts the urls from the supplied text that we should fetch OpenGraph previews for.
/// Unwraps markdown links, strips the LINK_REMOVED marker, excludes links to OpenChat messages
/// and limits the result to `MAX_LINK_PREVIEWS`.
pub fn extract_enabled_links(text: &str) -> Vec<String> {
    // Replace [display](url) with just the destination url so that the display text is not
    // matched separately from the (potentially different) href url.
    let unwrapped = MARKDOWN_LINK_REGEX.replace_all(text, "$1");

    let mut seen = Vec::new();
    for m in URL_REGEX.find_iter(&unwrapped) {
        let url = m.as_str().strip_suffix(LINK_REMOVED).unwrap_or(m.as_str());
        if is_oc_message_url(url) {
            continue;
        }
        let url = url.to_string();
        if seen.contains(&url) {
            continue;
        }
        seen.push(url);
        if seen.len() == MAX_LINK_PREVIEWS {
            break;
        }
    }
    seen
}

fn og_preview_image(data: &OgData) -> Option<OgPreviewImage> {
    // The service only reports dimensions if the source page provides og:image:width/height.
    // Consumers drop zero-dimension images, so if we don't have both we send no image at all.
    let url = data.image.clone()?;
    match (data.image_width, data.image_height) {
        (Some(width), Some(height)) if width > 0 && height > 0 => {
            Some(OgPreviewImage { url, width, height })
        }
        _ => None,
    }
}

async fn fetch_single_preview(
    client: &reqwest::Client,
    proxy_url: &str,
    url: &str,
) -> Option<OgPreview> {
    let request_url = format!(
        "{}/preview?url={}",
        proxy_url.trim_end_matches('/'),
        urlencoding_encode(url)
    );

    let response = client
        .get(request_url)
        .timeout(PREVIEW_TIMEOUT)
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let data: OgData = response.json().await.ok()?;
    // no title means the service could not find anything useful
    let title = data.title.clone().filter(|t| !t.is_empty())?;

    Some(OgPreview {
        url: url.to_string(),
        title,
        description: data.description.clone().unwrap_or_default(),
        image: og_preview_image(&data),
    })
}

// Minimal percent encoding for a url being passed as a query string value. We only need to
// escape the characters that would otherwise terminate or confuse the query string.
fn urlencoding_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

type SharedFetch = Shared<BoxFuture<'static, Option<OgPreview>>>;

struct CacheEntry {
    inserted: Instant,
    seq: u64,
    fetch: SharedFetch,
}

impl CacheEntry {
    fn is_live(&self) -> bool {
        // `peek` returns the resolved value if the fetch has already completed. We don't want to
        // remember failures for long, so those expire much sooner than successful lookups.
        let ttl = match self.fetch.peek() {
            Some(None) => NEGATIVE_CACHE_TTL,
            _ => CACHE_TTL,
        };
        self.inserted.elapsed() < ttl
    }
}

/// Fetches OpenGraph previews, caching results by url.
pub struct OgPreviewFetcher {
    client: reqwest::Client,
    proxy_url: String,
    cache: Mutex<HashMap<String, CacheEntry>>,
    next_seq: Mutex<u64>,
}

impl OgPreviewFetcher {
    pub fn new(proxy_url: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            proxy_url,
            cache: Mutex::new(HashMap::new()),
            next_seq: Mutex::new(0),
        }
    }

    /// Fetches previews for the links found in the supplied text. Never fails - the worst
    /// outcome is an empty list - and makes no http calls if the text has no eligible links.
    pub async fn fetch_for_text(&self, text: &str) -> Vec<OgPreview> {
        let urls = extract_enabled_links(text);
        if urls.is_empty() || self.proxy_url.is_empty() {
            return Vec::new();
        }

        // Fetch concurrently rather than serially - the whole lookup costs one timeout at worst
        let futures: Vec<_> = urls.iter().map(|url| self.fetch_one(url)).collect();

        futures::future::join_all(futures)
            .await
            .into_iter()
            .flatten()
            .collect()
    }

    fn fetch_one(&self, url: &str) -> SharedFetch {
        let mut cache = self.cache.lock().unwrap();

        if let Some(entry) = cache.get(url)
            && entry.is_live()
        {
            return entry.fetch.clone();
        }

        prune(&mut cache);

        let client = self.client.clone();
        let proxy_url = self.proxy_url.clone();
        let owned_url = url.to_string();
        let fetch: SharedFetch =
            async move { fetch_single_preview(&client, &proxy_url, &owned_url).await }
                .boxed()
                .shared();

        let seq = {
            let mut next = self.next_seq.lock().unwrap();
            *next += 1;
            *next
        };

        cache.insert(
            url.to_string(),
            CacheEntry {
                inserted: Instant::now(),
                seq,
                fetch: fetch.clone(),
            },
        );

        fetch
    }

    /// Empties the cache. Exposed primarily for tests.
    pub fn clear_cache(&self) {
        self.cache.lock().unwrap().clear();
    }
}

fn prune(cache: &mut HashMap<String, CacheEntry>) {
    cache.retain(|_, entry| entry.is_live());

    if cache.len() < MAX_CACHE_ENTRIES {
        return;
    }

    // Still full of live entries - drop the oldest 10% to make room.
    let mut seqs: Vec<u64> = cache.values().map(|e| e.seq).collect();
    seqs.sort_unstable();
    let cutoff = seqs[seqs.len() / 10];
    cache.retain(|_, entry| entry.seq > cutoff);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_links_yields_nothing() {
        assert!(extract_enabled_links("").is_empty());
        assert!(extract_enabled_links("just some words, no links here").is_empty());
    }

    #[test]
    fn extracts_a_bare_url() {
        assert_eq!(
            extract_enabled_links("look at https://example.com/thing"),
            vec!["https://example.com/thing"]
        );
    }

    #[test]
    fn extracts_markdown_link_destination() {
        assert_eq!(
            extract_enabled_links("[Some Title](https://www.youtube.com/watch?v=abc123)"),
            vec!["https://www.youtube.com/watch?v=abc123"]
        );
    }

    #[test]
    fn caps_at_three() {
        let text = (1..=5)
            .map(|i| format!("https://example.com/{i}"))
            .collect::<Vec<_>>()
            .join(" ");
        assert_eq!(
            extract_enabled_links(&text),
            vec![
                "https://example.com/1",
                "https://example.com/2",
                "https://example.com/3"
            ]
        );
    }

    #[test]
    fn caps_at_three_for_newline_joined_markdown_links() {
        let text = (1..=5)
            .map(|i| format!("[Video number {i}](https://www.youtube.com/watch?v=vid{i})"))
            .collect::<Vec<_>>()
            .join("\n");
        assert_eq!(
            extract_enabled_links(&text),
            vec![
                "https://www.youtube.com/watch?v=vid1",
                "https://www.youtube.com/watch?v=vid2",
                "https://www.youtube.com/watch?v=vid3"
            ]
        );
    }

    #[test]
    fn deduplicates() {
        assert_eq!(
            extract_enabled_links(
                "https://example.com/a https://example.com/a https://example.com/b"
            ),
            vec!["https://example.com/a", "https://example.com/b"]
        );
    }

    #[test]
    fn skips_openchat_message_links() {
        let text = "https://oc.app/community/abcdef/channel/123/45 https://oc.app/group/abcdef/45 https://example.com/keep";
        assert_eq!(
            extract_enabled_links(text),
            vec!["https://example.com/keep"]
        );
    }

    #[test]
    fn keeps_non_message_openchat_links() {
        assert_eq!(
            extract_enabled_links("https://oc.app/blog/something"),
            vec!["https://oc.app/blog/something"]
        );
    }

    #[test]
    fn strips_link_removed_marker() {
        assert_eq!(
            extract_enabled_links("https://example.com/a#LINK_REMOVED"),
            vec!["https://example.com/a"]
        );
    }

    #[test]
    fn encodes_query_values() {
        assert_eq!(
            urlencoding_encode("https://a.com/b?c=d&e=f"),
            "https%3A%2F%2Fa.com%2Fb%3Fc%3Dd%26e%3Df"
        );
    }
}
