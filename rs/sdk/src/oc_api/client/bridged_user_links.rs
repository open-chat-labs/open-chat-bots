use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::link_bridged_user::{self, LinkBridgedUserAction};
use crate::oc_api::actions::unlink_bridged_user::{self, UnlinkBridgedUserAction};
use crate::types::{BridgedUser, BridgedUserId, CanisterId};
use std::sync::Arc;

pub struct LinkBridgedUserBuilder<'c, R> {
    client: &'c Client<R, CanisterId>,
    user: BridgedUser,
    code: String,
}

impl<'c, R: Runtime> LinkBridgedUserBuilder<'c, R> {
    pub fn new(client: &'c Client<R, CanisterId>, user: BridgedUser, code: String) -> Self {
        LinkBridgedUserBuilder { client, user, code }
    }
}

impl<R: Runtime> ActionArgsBuilder<R> for LinkBridgedUserBuilder<'_, R> {
    type Action = LinkBridgedUserAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        *self.client.context()
    }

    fn into_args(self) -> link_bridged_user::Args {
        link_bridged_user::Args {
            user: self.user,
            code: self.code,
        }
    }
}

pub struct UnlinkBridgedUserBuilder<'c, R> {
    client: &'c Client<R, CanisterId>,
    user: BridgedUserId,
}

impl<'c, R: Runtime> UnlinkBridgedUserBuilder<'c, R> {
    pub fn new(client: &'c Client<R, CanisterId>, user: BridgedUserId) -> Self {
        UnlinkBridgedUserBuilder { client, user }
    }
}

impl<R: Runtime> ActionArgsBuilder<R> for UnlinkBridgedUserBuilder<'_, R> {
    type Action = UnlinkBridgedUserAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        *self.client.context()
    }

    fn into_args(self) -> unlink_bridged_user::Args {
        unlink_bridged_user::Args { user: self.user }
    }
}
