use crate::runtime::Runtime;
use crate::types::ActionContext;
use client::Client;
use std::sync::Arc;

mod client;

pub struct ClientFactory<R> {
    runtime: Arc<R>,
}

impl<R: Runtime> ClientFactory<R> {
    pub fn new(runtime: R) -> Self {
        Self {
            runtime: Arc::new(runtime),
        }
    }

    pub fn build(&self, context: impl Into<ActionContext>) -> Client<R> {
        Client::new(self.runtime.clone(), context.into())
    }
}
