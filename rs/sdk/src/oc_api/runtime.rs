use crate::types::{CallResult, CanisterId, OgPreview, TimestampMillis};
use serde::{Deserialize, Serialize};
use std::future::Future;

pub trait Runtime: Send + Sync + 'static {
    fn call_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
        &self,
        canister_id: CanisterId,
        method_name: &str,
        args: A,
    ) -> impl Future<Output = CallResult<R>> + Send;

    fn spawn<F: Future<Output = ()> + Send + 'static>(&self, f: F);

    fn now(&self) -> TimestampMillis;

    fn is_canister(&self) -> bool;

    /// Looks up OpenGraph previews for any links found in the given message text.
    ///
    /// Only offchain runtimes implement this. An in-canister runtime would have to make an http
    /// outcall to a scraper on the send path, which means a consensus-replicated fetch and a
    /// cycles cost every time a bot posts a link, so the default implementation returns nothing
    /// and in-canister bots must supply previews explicitly instead.
    ///
    /// Implementations must never panic or fail - the worst outcome of a preview lookup going
    /// wrong is an empty list.
    fn fetch_og_previews(&self, _text: String) -> impl Future<Output = Vec<OgPreview>> + Send {
        async { Vec::new() }
    }
}
