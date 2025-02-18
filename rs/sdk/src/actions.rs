use crate::types::{CallResult, CanisterId};
use crate::Runtime;
use candid::CandidType;
use serde::de::DeserializeOwned;
use std::future::Future;
use std::sync::Arc;

pub trait ActionArgsBuilder<R: Runtime>: Sized {
    type ActionArgs: CandidType + Clone + Send + 'static;
    type ActionResponse: CandidType + DeserializeOwned;

    fn runtime(&self) -> Arc<R>;

    fn bot_api_gateway(&self) -> CanisterId;

    fn method_name(&self) -> &str;

    fn into_args(self) -> Self::ActionArgs;

    fn execute<
        F: FnOnce(Self::ActionArgs, CallResult<Self::ActionResponse>) + Send + Sync + 'static,
    >(
        self,
        on_response: F,
    ) {
        let runtime = self.runtime();
        let runtime_clone = runtime.clone();
        let bot_api_gateway = self.bot_api_gateway();
        let method_name = self.method_name().to_string();
        let args = self.into_args();

        runtime.spawn(async move {
            let response = runtime_clone
                .call_canister(bot_api_gateway, &method_name, (args.clone(),))
                .await
                .map(|(r,)| r);

            on_response(args, response);
        });
    }

    fn execute_async(self) -> impl Future<Output = CallResult<Self::ActionResponse>> + Send {
        let runtime = self.runtime();
        let bot_api_gateway = self.bot_api_gateway();
        let method_name = self.method_name().to_string();
        let args = self.into_args();

        async move {
            runtime
                .call_canister(bot_api_gateway, &method_name, (args,))
                .await
                .map(|(r,)| r)
        }
    }
}
