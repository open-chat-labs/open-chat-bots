use super::Runtime;
use crate::types::{CallResult, CanisterId};
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::future::Future;
use std::sync::Arc;

pub mod add_reaction;
pub mod allocated_bucket;
pub mod bridged_users;
pub mod change_role;
pub mod chat_events;
pub mod chat_summary;
pub mod community_events;
pub mod community_summary;
pub mod create_channel;
pub mod delete_channel;
pub mod delete_messages;
pub mod edit_message;
pub mod installation_events;
pub mod invite_users;
#[cfg(feature = "bridge")]
pub mod link_bridged_user;
pub mod members;
pub mod mini_app_post_token;
pub mod mini_app_token;
pub mod remove_user;
pub mod send_message;
#[cfg(feature = "bridge")]
pub mod unlink_bridged_user;
pub mod upload_chunk;

pub trait ActionDef {
    type Args: Serialize + Clone + Send + 'static;
    type Response: DeserializeOwned;

    fn method_name(is_canister_runtime: bool) -> &'static str;

    /// Whether to call the method as a query. Canisters make every call as an update (see
    /// `Runtime::query_canister`), so OpenChat's read endpoints for bots, which are composite
    /// queries, have update versions for canisters to call instead (see `method_name`).
    fn is_query() -> bool {
        false
    }
}

/// Calls the action's method on the canister, as a query or an update as the action requires
pub async fn call_action<A: ActionDef, R: Runtime>(
    runtime: &R,
    canister_id: CanisterId,
    args: A::Args,
) -> CallResult<A::Response> {
    let is_canister = runtime.is_canister();
    let method_name = format!("{}_msgpack", A::method_name(is_canister));

    if A::is_query() {
        runtime
            .query_canister(canister_id, &method_name, args)
            .await
    } else {
        runtime.call_canister(canister_id, &method_name, args).await
    }
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
        let runtime_clone = runtime.clone();
        let api_gateway = self.api_gateway();
        let args = self.into_args();

        runtime.spawn(async move {
            let response =
                call_action::<Self::Action, R>(&*runtime_clone, api_gateway, args.clone()).await;

            on_response(args, response);
        });
    }

    fn execute_async(
        self,
    ) -> impl Future<Output = CallResult<<Self::Action as ActionDef>::Response>> + Send {
        let runtime = self.runtime();
        let api_gateway = self.api_gateway();
        let args = self.into_args();

        async move { call_action::<Self::Action, R>(&*runtime, api_gateway, args).await }
    }
}
