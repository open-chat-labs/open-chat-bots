mod async_handler;
mod canister_runtime;
pub mod env;
pub mod http_command_handler;
mod http_router;

pub use http_router::*;

pub use canister_runtime::CanisterRuntime;
use oc_bots_sdk::OpenChatClientFactory;
use std::sync::{Arc, LazyLock};

pub static OPENCHAT_CLIENT_FACTORY: LazyLock<Arc<OpenChatClientFactory<CanisterRuntime>>> =
    LazyLock::new(|| Arc::new(OpenChatClientFactory::new(CanisterRuntime)));
