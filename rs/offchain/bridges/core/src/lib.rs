//! What the Discord and Telegram bridges share: OpenChat's side of the bridge, pairing chats, and
//! where the bridge keeps its state. Each bridge implements `Platform` for its platform, serves
//! `http::router` to OpenChat, and passes the messages, edits and deletions it sees to `Bridge`.

pub mod bridge;
pub mod http;
pub mod model;
pub mod openchat;
pub mod platform;
pub mod store;
pub mod util;

pub use bridge::{Bridge, NotificationOutcome};
pub use model::{BridgeStore, Pairing, PendingPairing, PlatformChatId, PlatformMessageId};
pub use openchat::{Author, LinkedUser, OpenChat, OpenChatConfig};
pub use platform::{InboundMessage, OutboundMessage, PermanentFailure, Platform, platform_name};
pub use store::{DynamoDbStore, InMemoryStore, KeyValueStore};
