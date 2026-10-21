use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::bridged_users::{Args, BridgedUsersAction};
use crate::types::{BridgedUserId, CanisterId};
use std::sync::Arc;

pub struct BridgedUsersBuilder<'c, R> {
    client: &'c Client<R, CanisterId>,
    users: Vec<BridgedUserId>,
}

impl<'c, R: Runtime> BridgedUsersBuilder<'c, R> {
    pub fn new(client: &'c Client<R, CanisterId>, users: Vec<BridgedUserId>) -> Self {
        BridgedUsersBuilder { client, users }
    }
}

impl<R: Runtime> ActionArgsBuilder<R> for BridgedUsersBuilder<'_, R> {
    type Action = BridgedUsersAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        *self.client.context()
    }

    fn into_args(self) -> Args {
        Args { users: self.users }
    }
}
