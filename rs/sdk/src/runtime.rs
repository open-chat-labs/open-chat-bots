use crate::api::{create_channel, delete_channel, send_message};
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

    fn send_message(
        &self,
        api_gateway: CanisterId,
        args: send_message::Args,
    ) -> impl Future<Output = CallResult<(send_message::Response,)>> + Send {
        self.call_canister(api_gateway, "bot_send_message", (args,))
    }

    fn create_channel(
        &self,
        api_gateway: CanisterId,
        args: create_channel::Args,
    ) -> impl Future<Output = CallResult<(create_channel::Response,)>> + Send {
        self.call_canister(api_gateway, "bot_create_channel", (args,))
    }

    fn delete_channel(
        &self,
        api_gateway: CanisterId,
        args: delete_channel::Args,
    ) -> impl Future<Output = CallResult<(delete_channel::Response,)>> + Send {
        self.call_canister(api_gateway, "bot_delete_channel", (args,))
    }
}
