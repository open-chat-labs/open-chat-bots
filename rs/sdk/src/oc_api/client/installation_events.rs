use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::actions::installation_events::Args;
use crate::oc_api::actions::installation_events::InstallationsAction;
use crate::types::CanisterId;
use std::sync::Arc;

pub struct InstallationEventsBuilder<'c, R> {
    client: &'c Client<R, CanisterId>,
    from: u32,
    size: u16,
}

impl<'c, R: Runtime> InstallationEventsBuilder<'c, R> {
    pub fn new(client: &'c Client<R, CanisterId>) -> Self {
        InstallationEventsBuilder {
            client,
            from: 0,
            size: 10_000,
        }
    }

    pub fn from(mut self, index: u32) -> Self {
        self.from = index;
        self
    }

    pub fn size(mut self, value: u16) -> Self {
        self.size = value;
        self
    }
}

impl<R: Runtime> ActionArgsBuilder<R> for InstallationEventsBuilder<'_, R> {
    type Action = InstallationsAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        *self.client.context()
    }

    fn into_args(self) -> Args {
        Args {
            from: self.from,
            size: self.size,
        }
    }
}
