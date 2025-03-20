use super::Runtime;
use crate::types::{CallResult, CanisterId};
use candid::CandidType;
use serde::de::DeserializeOwned;
use std::future::Future;
use std::sync::Arc;

pub mod chat_details;
pub mod chat_events;
pub mod create_channel;
pub mod delete_channel;
pub mod send_message;

pub trait ActionDef {
    type Args: CandidType + Clone + Send + 'static;
    type Response: CandidType + DeserializeOwned;

    fn method_name(is_canister_runtime: bool) -> &'static str;
}

pub trait ActionArgsBuilder<R: Runtime>: Sized {
    type Action: ActionDef;

    fn runtime(&self) -> Arc<R>;

    fn api_gateway(&self) -> CanisterId;

    fn into_args(self) -> <Self::Action as ActionDef>::Args;

    fn execute<
        F: FnOnce(
                <Self::Action as ActionDef>::Args,
                CallResult<<Self::Action as ActionDef>::Response>,
            ) + Send
            + Sync
            + 'static,
    >(
        self,
        on_response: F,
    ) {
        let runtime = self.runtime();
        let is_canister_runtime = runtime.is_canister();
        let runtime_clone = runtime.clone();
        let api_gateway = self.api_gateway();
        let method_name = Self::Action::method_name(is_canister_runtime);
        let args = self.into_args();

        runtime.spawn(async move {
            let response = runtime_clone
                .call_canister(api_gateway, method_name, (args.clone(),))
                .await
                .map(|(r,)| r);

            on_response(args, response);
        });
    }

    fn execute_async(
        self,
    ) -> impl Future<Output = CallResult<<Self::Action as ActionDef>::Response>> + Send {
        let runtime = self.runtime();
        let api_gateway = self.api_gateway();
        let is_canister_runtime = runtime.is_canister();
        let method_name = Self::Action::method_name(is_canister_runtime);
        let args = self.into_args();

        async move {
            runtime
                .call_canister(api_gateway, method_name, (args,))
                .await
                .map(|(r,)| r)
        }
    }
}
