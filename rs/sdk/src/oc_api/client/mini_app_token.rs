use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::mini_app_token::{Args, MiniAppTokenAction};
use crate::types::CanisterId;
use std::sync::Arc;

pub struct MiniAppTokenBuilder<'c, R> {
    client: &'c Client<R, CanisterId>,
}

impl<'c, R: Runtime> MiniAppTokenBuilder<'c, R> {
    pub fn new(client: &'c Client<R, CanisterId>) -> Self {
        MiniAppTokenBuilder { client }
    }
}

impl<R: Runtime> ActionArgsBuilder<R> for MiniAppTokenBuilder<'_, R> {
    type Action = MiniAppTokenAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        *self.client.context()
    }

    fn into_args(self) -> Args {
        Args {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::msgpack;
    use crate::oc_api::actions::mini_app_token::Response;
    use crate::types::{CallResult, TimestampMillis};
    use ic_principal::Principal;
    use serde::{Deserialize, Serialize};
    use std::future::Future;
    use std::sync::Mutex;

    // The canister, the method, the args in msgpack, and whether it was called as a query
    type Call = (CanisterId, String, Vec<u8>, bool);

    // Answers every call with a token, and records them
    #[derive(Default)]
    struct FakeRuntime {
        calls: Mutex<Vec<Call>>,
    }

    impl FakeRuntime {
        fn call<A: Serialize, R: for<'a> Deserialize<'a>>(
            &self,
            canister_id: CanisterId,
            method_name: &str,
            args: A,
            is_query: bool,
        ) -> CallResult<R> {
            self.calls.lock().unwrap().push((
                canister_id,
                method_name.to_string(),
                msgpack::serialize_then_unwrap(args),
                is_query,
            ));
            let bytes = msgpack::serialize_then_unwrap(Response::Success("token".to_string()));
            Ok(msgpack::deserialize_then_unwrap(&bytes))
        }
    }

    impl Runtime for FakeRuntime {
        async fn call_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
            &self,
            canister_id: CanisterId,
            method_name: &str,
            args: A,
        ) -> CallResult<R> {
            self.call(canister_id, method_name, args, false)
        }

        async fn query_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
            &self,
            canister_id: CanisterId,
            method_name: &str,
            args: A,
        ) -> CallResult<R> {
            self.call(canister_id, method_name, args, true)
        }

        fn spawn<F: Future<Output = ()> + Send + 'static>(&self, _: F) {
            unimplemented!()
        }

        fn now(&self) -> TimestampMillis {
            0
        }

        fn is_canister(&self) -> bool {
            false
        }
    }

    // As OpenChat's `Empty` args, an empty map
    #[test]
    fn asks_the_local_user_index_for_a_token() {
        let runtime = Arc::new(FakeRuntime::default());
        let local_user_index = CanisterId::from(Principal::from_slice(&[1]));
        let client = Client::new(runtime.clone(), local_user_index);

        let response =
            futures_util::FutureExt::now_or_never(client.mini_app_token().execute_async()).unwrap();

        assert!(matches!(response, Ok(Response::Success(t)) if t == "token"));
        let calls = runtime.calls.lock().unwrap();
        assert_eq!(
            *calls,
            [(
                local_user_index,
                "bot_mini_app_token_msgpack".to_string(),
                vec![0x80],
                true
            )]
        );
    }
}
