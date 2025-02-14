mod canister_runtime;
pub mod env;
mod http_router;

pub use http_router::*;

pub use canister_runtime::CanisterRuntime;
use oc_bots_sdk::OpenChatClient;
use std::sync::{Arc, LazyLock};

pub static OPENCHAT_CLIENT: LazyLock<Arc<OpenChatClient<CanisterRuntime>>> =
    LazyLock::new(|| Arc::new(OpenChatClient::new(CanisterRuntime)));
