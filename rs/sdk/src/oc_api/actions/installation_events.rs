use super::ActionDef;
use crate::types::{
    BotPermissions, CanisterId, InstallationLocation, OCError, TimestampMillis, UserId,
};
use serde::{Deserialize, Serialize};

pub struct InstallationsAction;

impl ActionDef for InstallationsAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_is_canister_runtime: bool) -> &'static str {
        "bot_installation_events"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub from: u32,
    pub size: u16,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(SuccessResult),
    Error(OCError),
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SuccessResult {
    pub bot_id: UserId,
    pub events: Vec<BotInstallationEvent>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum BotInstallationEvent {
    Installed(BotInstalled),
    Uninstalled(BotUninstalled),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BotInstalled {
    pub location: InstallationLocation,
    pub api_gateway: CanisterId,
    pub granted_permissions: BotPermissions,
    pub granted_autonomous_permissions: BotPermissions,
    pub installed_by: UserId,
    pub timestamp: TimestampMillis,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BotUninstalled {
    pub location: InstallationLocation,
    pub uninstalled_by: UserId,
    pub timestamp: TimestampMillis,
}
