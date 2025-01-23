use crate::types::{
    ActionArgs, ActionResponse, BotAction, CallResult, CanisterId, TimestampMillis,
};
use candid::utils::{ArgumentDecoder, ArgumentEncoder};
use std::future::Future;

pub trait Runtime {
    fn call_canister<A: ArgumentEncoder + Send, R: for<'a> ArgumentDecoder<'a>>(
        &self,
        canister_id: CanisterId,
        method_name: &str,
        args: A,
    ) -> impl Future<Output = CallResult<R>> + Send;

    fn spawn<F: Future<Output = ()> + Send + 'static>(&self, f: F);

    fn now(&self) -> TimestampMillis;

    fn execute_bot_action(
        &self,
        bot_api_gateway: CanisterId,
        jwt: String,
        action: BotAction,
    ) -> impl Future<Output = CallResult<(ActionResponse,)>> + Send {
        let args = ActionArgs { action, jwt };

        self.call_canister(bot_api_gateway, "execute_bot_action", (args.clone(),))
    }
}
