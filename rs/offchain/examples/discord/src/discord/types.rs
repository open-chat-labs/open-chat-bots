use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum ChannelStatus {
    TokenNotSet,
    Operational,
    ProxyFailed(String),
}
