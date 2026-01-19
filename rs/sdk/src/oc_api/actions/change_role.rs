use crate::oc_api::actions::ActionDef;
use crate::types::{BotChatContext, ChatRole, OCError, UserId};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub struct ChangeRoleAction;

impl ActionDef for ChangeRoleAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "bot_change_role"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub chat_context: BotChatContext,
    pub user_ids: Vec<UserId>,
    pub new_role: ChatRole,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success,
    PartialSuccess(HashMap<UserId, OCError>),
    Error(OCError),
}
