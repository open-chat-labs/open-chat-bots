use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Keeps values for a while, so popular charts don't ask the price APIs again each time
pub struct Cache<K, V> {
    entries: Mutex<HashMap<K, (Instant, V)>>,
}

impl<K: Eq + Hash, V: Clone> Cache<K, V> {
    pub fn get(&self, key: &K, max_age: Duration) -> Option<V> {
        let entries = self.entries.lock().unwrap();
        let (at, value) = entries.get(key)?;
        (at.elapsed() < max_age).then(|| value.clone())
    }

    pub fn insert(&self, key: K, value: V, max_age: Duration) {
        let mut entries = self.entries.lock().unwrap();
        // Dropping what's expired as it goes keeps it from growing without bound
        entries.retain(|_, (at, _)| at.elapsed() < max_age);
        entries.insert(key, (Instant::now(), value));
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
        assert_eq!(cache.get(&"a", Duration::from_secs(60)), Some(1));
        assert_eq!(cache.get(&"a", Duration::ZERO), None);
        assert_eq!(cache.get(&"b", Duration::from_secs(60)), None);
    }

    #[test]
    fn the_rate_limiter_allows_up_to_its_limit() {
        let limiter = RateLimiter::per_minute(2);
        assert!(limiter.try_call());
        assert!(limiter.try_call());
        assert!(!limiter.try_call());
    }
}
