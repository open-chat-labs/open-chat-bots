mod async_handler;
mod canister_runtime;
pub mod env;
pub mod http_command_handler;
mod http_router;
mod raw_rand;

pub use http_router::*;
pub use raw_rand::*;

pub use canister_runtime::CanisterRuntime;
use oc_bots_sdk::oc_api::client::ClientFactory;
use std::sync::{Arc, LazyLock};

pub static OPENCHAT_CLIENT_FACTORY: LazyLock<Arc<ClientFactory<CanisterRuntime>>> =
    LazyLock::new(|| Arc::new(ClientFactory::new(CanisterRuntime)));
