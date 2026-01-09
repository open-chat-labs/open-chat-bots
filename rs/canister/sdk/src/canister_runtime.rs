use oc_bots_sdk::{
    msgpack,
    oc_api::Runtime,
    types::{CallResult, CanisterId, TimestampMillis},
};
use serde::{Deserialize, Serialize};
use std::future::Future;

#[derive(Clone, Default)]
pub struct CanisterRuntime;

impl Runtime for CanisterRuntime {
    async fn call_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
        &self,
        canister_id: CanisterId,
        method_name: &str,
        args: A,
    ) -> CallResult<R> {
        match ic_cdk::api::call::call_raw(
            canister_id.into(),
            method_name,
            &msgpack::serialize_then_unwrap(args),
            0,
        )
        .await
        {
            Ok(bytes) => Ok(msgpack::deserialize_then_unwrap(&bytes)),
            Err((code, msg)) => Err((code as i32, msg)),
        }
    }

    fn spawn<F: Future<Output = ()> + 'static>(&self, f: F) {
        ic_cdk::spawn(f)
    }

    fn now(&self) -> TimestampMillis {
        crate::env::now()
    }

    fn is_canister(&self) -> bool {
        true
    }
}
