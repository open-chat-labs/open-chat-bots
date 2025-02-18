use crate::types::{CallResult, CanisterId};
use crate::Runtime;
use candid::CandidType;
use serde::de::DeserializeOwned;
use std::future::Future;
use std::sync::Arc;

pub mod create_channel;
pub mod delete_channel;
pub mod send_message;

pub trait ActionDef {
    type Args: CandidType + Clone + Send + 'static;
    type Response: CandidType + DeserializeOwned;

    fn method_name() -> &'static str;
}

pub trait ActionArgsBuilder<R: Runtime>: Sized {
    type Action: ActionDef;

    fn runtime(&self) -> Arc<R>;

    fn bot_api_gateway(&self) -> CanisterId;

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
        let runtime_clone = runtime.clone();
        let bot_api_gateway = self.bot_api_gateway();
        let method_name = Self::Action::method_name();
        let args = self.into_args();

        runtime.spawn(async move {
            let response = runtime_clone
                .call_canister(bot_api_gateway, method_name, (args.clone(),))
                .await
                .map(|(r,)| r);

            on_response(args, response);
        });
    }

    fn execute_async(
        self,
    ) -> impl Future<Output = CallResult<<Self::Action as ActionDef>::Response>> + Send {
        let runtime = self.runtime();
        let bot_api_gateway = self.bot_api_gateway();
        let method_name = Self::Action::method_name();
        let args = self.into_args();

        async move {
            runtime
                .call_canister(bot_api_gateway, method_name, (args,))
                .await
                .map(|(r,)| r)
        }
    }
}
