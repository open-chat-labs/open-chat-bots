use crate::oc_api::actions::ActionDef;
use crate::types::{BridgedUserId, UnitResult};
use serde::{Deserialize, Serialize};

/// For a bridge bot to unlink an account on its platform from whoever it's linked to, when the
/// account's owner asks there
pub struct UnlinkBridgedUserAction;

impl ActionDef for UnlinkBridgedUserAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "unlink_bridged_user"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub user: BridgedUserId,
}

pub type Response = UnitResult;
