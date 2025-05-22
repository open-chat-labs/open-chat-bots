use crate::types::{BotPermissions, CanisterId, InstallationLocation};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default)]
pub struct InstallationRegistry {
    locations: HashMap<InstallationLocation, InstallationRecord>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct InstallationRecord {
    pub api_gateway: CanisterId,
    pub granted_command_permissions: BotPermissions,
    pub granted_autonomous_permissions: BotPermissions,
}

impl InstallationRegistry {
    pub fn new() -> Self {
        InstallationRegistry::default()
    }

    pub fn insert(&mut self, location: InstallationLocation, details: InstallationRecord) -> bool {
        self.locations.insert(location, details).is_some()
    }

    pub fn remove(&mut self, location: &InstallationLocation) {
        self.locations.remove(location);
    }

    pub fn get(&self, location: &InstallationLocation) -> Option<&InstallationRecord> {
        self.locations.get(location)
    }

    pub fn count(&self) -> usize {
        self.locations.len()
    }
}
