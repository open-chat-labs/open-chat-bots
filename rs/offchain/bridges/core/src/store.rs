use anyhow::Result;
use async_trait::async_trait;
use aws_sdk_dynamodb::Client as DynamoDbClient;
use aws_sdk_dynamodb::primitives::Blob;
use aws_sdk_dynamodb::types::AttributeValue;
use oc_bots_sdk::types::TimestampMillis;
use oc_bots_sdk_offchain::env;
use std::collections::HashMap;
use std::sync::Mutex;

/// Where a bridge keeps its state: which chats are paired, which messages were relayed, and the
/// notifications it has had. A key with an expiry reads as missing once it has passed.
#[async_trait]
pub trait KeyValueStore: Send + Sync + 'static {
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>>;

    async fn put(&self, key: &str, value: Vec<u8>, expires: Option<TimestampMillis>) -> Result<()>;

    async fn delete(&self, key: &str) -> Result<()>;
}

// A value and when it expires, if it does
type Entry = (Vec<u8>, Option<TimestampMillis>);

/// For tests and running locally. Everything is lost on restart.
#[derive(Default)]
pub struct InMemoryStore {
    values: Mutex<HashMap<String, Entry>>,
}

impl InMemoryStore {
    fn live(entry: &Entry, now: TimestampMillis) -> bool {
        entry.1.is_none_or(|expires| expires > now)
    }
}

#[async_trait]
impl KeyValueStore for InMemoryStore {
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
        let now = env::now();
        let values = self.values.lock().unwrap();
        Ok(values
            .get(key)
            .filter(|entry| Self::live(entry, now))
            .map(|(value, _)| value.clone()))
    }

    async fn put(&self, key: &str, value: Vec<u8>, expires: Option<TimestampMillis>) -> Result<()> {
        self.values
            .lock()
            .unwrap()
            .insert(key.to_string(), (value, expires));
        Ok(())
    }

    async fn delete(&self, key: &str) -> Result<()> {
        self.values.lock().unwrap().remove(key);
        Ok(())
    }
}

/// A DynamoDB table whose partition key is the string attribute `k`. Values are in `v`. An item
/// with an expiry has it in `e` (milliseconds), and in `ttl` (seconds) for DynamoDB's TTL, which
/// should be enabled on that attribute so expired items are cleaned up. DynamoDB can take a while
/// to remove them, so reads check `e` themselves.
pub struct DynamoDbStore {
    client: DynamoDbClient,
    table: String,
}

impl DynamoDbStore {
    /// Uses the AWS credentials and region from the environment
    pub async fn new(table: String) -> Self {
        let config = aws_config::load_from_env().await;
        DynamoDbStore {
            client: DynamoDbClient::new(&config),
            table,
        }
    }

    fn item(
        key: &str,
        value: Vec<u8>,
        expires: Option<TimestampMillis>,
    ) -> HashMap<String, AttributeValue> {
        let mut item = HashMap::from([
            ("k".to_string(), AttributeValue::S(key.to_string())),
            ("v".to_string(), AttributeValue::B(Blob::new(value))),
        ]);
        if let Some(expires) = expires {
            item.insert("e".to_string(), AttributeValue::N(expires.to_string()));
            item.insert(
                "ttl".to_string(),
                AttributeValue::N((expires / 1000).to_string()),
            );
        }
        item
    }
}

#[async_trait]
impl KeyValueStore for DynamoDbStore {
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>> {
        let output = self
            .client
            .get_item()
            .table_name(&self.table)
            .key("k", AttributeValue::S(key.to_string()))
            .consistent_read(true)
            .send()
            .await?;

        let Some(item) = output.item else {
            return Ok(None);
        };
        let expired = item
            .get("e")
            .and_then(|e| e.as_n().ok())
            .and_then(|e| e.parse::<TimestampMillis>().ok())
            .is_some_and(|expires| expires <= env::now());
        if expired {
            return Ok(None);
        }
        Ok(item
            .get("v")
            .and_then(|v| v.as_b().ok())
            .map(|blob| blob.clone().into_inner()))
    }

    async fn put(&self, key: &str, value: Vec<u8>, expires: Option<TimestampMillis>) -> Result<()> {
        self.client
            .put_item()
            .table_name(&self.table)
            .set_item(Some(Self::item(key, value, expires)))
            .send()
            .await?;
        Ok(())
    }

    async fn delete(&self, key: &str) -> Result<()> {
        self.client
            .delete_item()
            .table_name(&self.table)
            .key("k", AttributeValue::S(key.to_string()))
            .send()
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn in_memory_store_expires() {
        let store = InMemoryStore::default();
        let now = env::now();

        store.put("a", vec![1], None).await.unwrap();
        assert_eq!(store.get("a").await.unwrap(), Some(vec![1]));
        store.delete("a").await.unwrap();
        assert_eq!(store.get("a").await.unwrap(), None);

        store.put("b", vec![1], Some(now - 1)).await.unwrap();
        assert_eq!(store.get("b").await.unwrap(), None);
        store.put("c", vec![1], Some(now + 60_000)).await.unwrap();
        assert_eq!(store.get("c").await.unwrap(), Some(vec![1]));
    }
}
