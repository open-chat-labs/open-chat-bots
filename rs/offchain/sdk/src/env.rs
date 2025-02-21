use oc_bots_sdk::types::TimestampMillis;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now() -> TimestampMillis {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as TimestampMillis
}
