use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Keeps values for a while, so popular charts don't ask the price APIs again each time
pub struct Cache<K, V> {
    // Each value with when it expires
    entries: Mutex<HashMap<K, (Instant, V)>>,
}

impl<K: Eq + Hash, V: Clone> Cache<K, V> {
    pub fn get(&self, key: &K) -> Option<V> {
        let entries = self.entries.lock().unwrap();
        let (expires, value) = entries.get(key)?;
        (*expires > Instant::now()).then(|| value.clone())
    }

    pub fn insert(&self, key: K, value: V, max_age: Duration) {
        let now = Instant::now();
        let mut entries = self.entries.lock().unwrap();
        // Dropping what's expired as it goes keeps it from growing without bound
        entries.retain(|_, (expires, _)| *expires > now);
        entries.insert(key, (now + max_age, value));
    }
}

impl<K, V> Default for Cache<K, V> {
    fn default() -> Self {
        Cache {
            entries: Mutex::default(),
        }
    }
}

/// Allows at most `limit` calls per minute, to stay within an API's rate limit
pub struct RateLimiter {
    limit: usize,
    calls: Mutex<Vec<Instant>>,
}

impl RateLimiter {
    pub fn per_minute(limit: usize) -> Self {
        RateLimiter {
            limit,
            calls: Mutex::default(),
        }
    }

    /// Whether a call can be made now, which counts it if so
    pub fn try_call(&self) -> bool {
        let mut calls = self.calls.lock().unwrap();
        calls.retain(|at| at.elapsed() < Duration::from_secs(60));
        if calls.len() < self.limit {
            calls.push(Instant::now());
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_expire() {
        let cache = Cache::default();
        cache.insert("a", 1, Duration::from_secs(60));
        cache.insert("b", 2, Duration::ZERO);
        assert_eq!(cache.get(&"a"), Some(1));
        assert_eq!(cache.get(&"b"), None);
        assert_eq!(cache.get(&"c"), None);
    }

    #[test]
    fn each_value_keeps_its_own_max_age() {
        let cache = Cache::default();
        cache.insert("long", 1, Duration::from_secs(3600));
        std::thread::sleep(Duration::from_millis(5));
        // Inserting something short-lived mustn't drop what's long-lived
        cache.insert("short", 2, Duration::from_millis(1));
        assert_eq!(cache.get(&"long"), Some(1));
    }

    #[test]
    fn the_rate_limiter_allows_up_to_its_limit() {
        let limiter = RateLimiter::per_minute(2);
        assert!(limiter.try_call());
        assert!(limiter.try_call());
        assert!(!limiter.try_call());
    }
}
