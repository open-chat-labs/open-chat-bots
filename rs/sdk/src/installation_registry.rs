use crate::types::{BotPermissions, CanisterId, InstallationLocation, TimestampMillis};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default)]
pub struct InstallationRegistry {
    locations: HashMap<InstallationLocation, InstallationRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstallationRecord {
    pub api_gateway: CanisterId,
    pub granted_command_permissions: BotPermissions,
    pub granted_autonomous_permissions: BotPermissions,
    #[serde(default)]
    pub last_updated: TimestampMillis,
}

impl InstallationRegistry {
    pub fn new() -> Self {
        InstallationRegistry::default()
    }

    pub fn insert(&mut self, location: InstallationLocation, new_record: InstallationRecord) {
        if let Some(record) = self.locations.get_mut(&location)
            && new_record.last_updated <= record.last_updated
        {
            return;
        }

        self.locations.insert(location, new_record);
    }

    pub fn remove(&mut self, location: &InstallationLocation, timestamp: TimestampMillis) {
        if self
            .locations
            .get(location)
            .is_some_and(|l| l.last_updated < timestamp)
        {
            self.locations.remove(location);
        }
    }

    pub fn get(&self, location: &InstallationLocation) -> Option<&InstallationRecord> {
        self.locations.get(location)
    }

    pub fn count(&self) -> usize {
        self.locations.len()
    }
}
