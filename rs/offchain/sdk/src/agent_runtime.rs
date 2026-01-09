use ic_agent::Agent;
use oc_bots_sdk::msgpack;
use oc_bots_sdk::oc_api::Runtime;
use oc_bots_sdk::types::{CallResult, CanisterId, TimestampMillis};
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::time::SystemTime;

pub struct AgentRuntime {
    agent: Agent,
    runtime: tokio::runtime::Runtime,
}

impl AgentRuntime {
    pub fn new(agent: Agent, runtime: tokio::runtime::Runtime) -> Self {
        Self { agent, runtime }
    }
}

impl Runtime for AgentRuntime {
    async fn call_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
        &self,
        canister_id: CanisterId,
        method_name: &str,
        args: A,
    ) -> CallResult<R> {
        match self
            .agent
            .update(&canister_id.into(), method_name)
            .with_arg(msgpack::serialize_then_unwrap(args))
            .call_and_wait()
            .await
        {
            Ok(bytes) => Ok(msgpack::deserialize_then_unwrap(&bytes)),
            Err(error) => Err((0, error.to_string())),
        }
    }

    fn spawn<F: Future<Output = ()> + Send + 'static>(&self, f: F) {
        self.runtime.spawn(f);
    }

    fn now(&self) -> TimestampMillis {
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as TimestampMillis
    }

    fn is_canister(&self) -> bool {
        false
    }
}
