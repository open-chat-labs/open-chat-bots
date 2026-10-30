use crate::oc_api::actions::ActionDef;
use serde::{Deserialize, Serialize};

/// A token which says which bot is calling OpenChat's MiniApp service, which the bot sends with each
/// call to it, from any LocalUserIndex, called as the bot. It's valid for an hour.
pub struct MiniAppTokenAction;

impl ActionDef for MiniAppTokenAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_mini_app_token"
    }

    fn is_query() -> bool {
        true
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(String),
    NotAuthorized,
    InternalError(String),
}
