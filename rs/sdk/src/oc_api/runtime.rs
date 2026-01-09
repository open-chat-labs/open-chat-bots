use crate::types::{CallResult, CanisterId, TimestampMillis};
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
}
