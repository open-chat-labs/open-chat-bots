use crate::types::{CallResult, CanisterId, TimestampMillis};
use candid::utils::{ArgumentDecoder, ArgumentEncoder};
use std::future::Future;

pub trait Runtime: Send + Sync + 'static {
    fn call_canister<A: ArgumentEncoder + Send, R: for<'a> ArgumentDecoder<'a>>(
        &self,
        canister_id: CanisterId,
        method_name: &str,
        args: A,
    ) -> impl Future<Output = CallResult<R>> + Send;

    fn spawn<F: Future<Output = ()> + Send + 'static>(&self, f: F);

    fn now(&self) -> TimestampMillis;

    fn is_canister(&self) -> bool;
}
