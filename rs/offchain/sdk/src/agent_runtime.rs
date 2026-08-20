use crate::link_previews::{DEFAULT_PREVIEW_PROXY_URL, OgPreviewFetcher};
use ic_agent::Agent;
use oc_bots_sdk::msgpack;
use oc_bots_sdk::oc_api::Runtime;
use oc_bots_sdk::types::{CallResult, CanisterId, OgPreview, TimestampMillis};
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::time::SystemTime;

/// Controls how the offchain runtime populates `og_previews` on outgoing messages.
pub struct OgPreviewConfig {
    /// When true (the default) any message whose text contains links will have OpenGraph
    /// previews looked up and attached automatically.
    pub auto_fetch: bool,
    /// The base url of the OpenGraph preview service.
    pub proxy_url: String,
}

impl Default for OgPreviewConfig {
    fn default() -> Self {
        Self {
            auto_fetch: true,
            proxy_url: DEFAULT_PREVIEW_PROXY_URL.to_string(),
        }
    }
}

pub struct AgentRuntime {
    agent: Agent,
    runtime: tokio::runtime::Runtime,
    og_preview_fetcher: Option<OgPreviewFetcher>,
}

impl AgentRuntime {
    pub fn new(agent: Agent, runtime: tokio::runtime::Runtime) -> Self {
        Self::new_with_og_preview_config(agent, runtime, OgPreviewConfig::default())
    }

    pub fn new_with_og_preview_config(
        agent: Agent,
        runtime: tokio::runtime::Runtime,
        config: OgPreviewConfig,
    ) -> Self {
        let og_preview_fetcher = config
            .auto_fetch
            .then(|| OgPreviewFetcher::new(config.proxy_url));

        Self {
            agent,
            runtime,
            og_preview_fetcher,
        }
    }
}

impl Runtime for AgentRuntime {
    async fn call_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
        &self,
        canister_id: CanisterId,
        method_name: &str,
        args: A,
    ) -> CallResult<R> {
        match self
            .agent
            .update(&canister_id.into(), method_name)
            .with_arg(msgpack::serialize_then_unwrap(args))
            .call_and_wait()
            .await
        {
            Ok(bytes) => Ok(msgpack::deserialize_then_unwrap(&bytes)),
            Err(error) => Err((0, error.to_string())),
        }
    }

    fn spawn<F: Future<Output = ()> + Send + 'static>(&self, f: F) {
        self.runtime.spawn(f);
    }

    fn now(&self) -> TimestampMillis {
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as TimestampMillis
    }

    fn is_canister(&self) -> bool {
        false
    }

    async fn fetch_og_previews(&self, text: String) -> Vec<OgPreview> {
        match self.og_preview_fetcher.as_ref() {
            Some(fetcher) => fetcher.fetch_for_text(&text).await,
            None => Vec::new(),
        }
    }
}
