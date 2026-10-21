use crate::oc_api::actions::ActionDef;
use crate::types::{BridgedUserId, BridgedUserSummary};
use serde::{Deserialize, Serialize};

/// The UserIndex looks up at most this many accounts per call, and ignores the rest
pub const MAX_BRIDGED_USERS: usize = 100;

/// The latest profiles of the given accounts on other platforms, from OpenChat's UserIndex, and the
/// OpenChat users they're linked to. An account no bridge bot has relayed a message from yet is
/// left out.
pub struct BridgedUsersAction;

impl ActionDef for BridgedUsersAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bridged_users"
    }

    fn is_query(is_canister_runtime: bool) -> bool {
        !is_canister_runtime
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub users: Vec<BridgedUserId>,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(Vec<BridgedUserSummary>),
}
