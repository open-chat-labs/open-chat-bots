use crate::types::{CanisterId, InstallationLocation};
use rand::{Rng, rngs::StdRng};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default)]
pub struct ApiKeyRegistry {
    map_by_key: HashMap<String, (CanisterId, InstallationLocation)>,
    map_by_location: HashMap<InstallationLocation, String>,
}

impl ApiKeyRegistry {
    pub fn new() -> Self {
        ApiKeyRegistry::default()
    }

    pub fn generate(
        &mut self,
        gateway: CanisterId,
        location: InstallationLocation,
        rng: &mut StdRng,
    ) -> String {
        let api_key = rng.r#gen::<u128>().to_string();

        // Get the existing api key for this location, if any, and remove it from map_by_key.
        // This ensures that for a given location, there is only one api key.
        if let Some(existing_api_key) = self.map_by_location.remove(&location) {
            self.map_by_key.remove(&existing_api_key);
        }

        // Insert the new api key into both maps.
        self.map_by_key.insert(api_key.clone(), (gateway, location));
        self.map_by_location.insert(location, api_key.clone());

        api_key
    }

    pub fn lookup(&self, api_key: &str) -> Option<(CanisterId, InstallationLocation)> {
        self.map_by_key.get(api_key).cloned()
    }

    pub fn remove(&mut self, location: &InstallationLocation) {
        if let Some(api_key) = self.map_by_location.remove(location) {
            self.map_by_key.remove(&api_key);
        }
    }

    pub fn len(&self) -> usize {
        self.map_by_key.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map_by_key.is_empty()
    }
}
