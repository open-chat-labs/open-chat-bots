use candid::utils::{ArgumentDecoder, ArgumentEncoder};
use oc_bots_sdk::types::{CallResult, CanisterId, TimestampMillis};
use oc_bots_sdk::Runtime;
use std::future::Future;

#[derive(Clone, Default)]
pub struct CanisterRuntime;

impl Runtime for CanisterRuntime {
    async fn call_canister<A: ArgumentEncoder + Send, R: for<'a> ArgumentDecoder<'a>>(
        &self,
        canister_id: CanisterId,
        method_name: &str,
        args: A,
    ) -> CallResult<R> {
        match ic_cdk::api::call::call(canister_id, method_name, args).await {
            Ok(result) => Ok(result),
            Err((code, msg)) => Err((code as i32, msg)),
        }
    }

    fn spawn<F: Future<Output = ()> + 'static>(&self, f: F) {
        ic_cdk::spawn(f)
    }

    fn now(&self) -> TimestampMillis {
        crate::env::now()
    }
}
