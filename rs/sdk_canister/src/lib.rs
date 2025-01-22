mod canister_runtime;
pub mod env;

pub use canister_runtime::CanisterRuntime;
use oc_bots_sdk::OpenChatClient;
use std::sync::LazyLock;

pub static OPENCHAT_CLIENT: LazyLock<OpenChatClient<CanisterRuntime>> =
    LazyLock::new(|| OpenChatClient::new(CanisterRuntime));
