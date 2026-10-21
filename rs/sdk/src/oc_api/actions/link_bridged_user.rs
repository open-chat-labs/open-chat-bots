use crate::oc_api::actions::ActionDef;
use crate::types::{BridgedUser, OCError, UserId};
use serde::{Deserialize, Serialize};

/// For a bridge bot to link an account on its platform to the OpenChat user who was given `code`,
/// once the bot knows who owns the account, eg. through Discord's OAuth. A user gets a code from
/// their OpenChat profile, which takes them to the bridge with it. Only the platform's bridge bot
/// can redeem a code, and only once, within 10 minutes.
pub struct LinkBridgedUserAction;

impl ActionDef for LinkBridgedUserAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "link_bridged_user"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub user: BridgedUser,
    pub code: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(SuccessResult),
    Error(OCError),
}

/// The OpenChat user the account is now linked to, so the bot can tell its owner
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SuccessResult {
    pub user_id: UserId,
    pub username: String,
}
