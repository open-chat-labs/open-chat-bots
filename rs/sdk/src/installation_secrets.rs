use crate::types::InstallationLocation;
use rand::{rngs::StdRng, Rng};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default)]
pub struct InstallationSecrets {
    secrets: HashMap<String, InstallationLocation>,
}

impl InstallationSecrets {
    pub fn new() -> Self {
        InstallationSecrets::default()
    }

    pub fn generate(&mut self, location: InstallationLocation, rng: &mut StdRng) -> String {
        let secret = rng.gen::<u128>().to_string();
        self.secrets.insert(secret.clone(), location);
        secret
    }

    pub fn verify(&self, api_key: &str) -> Option<&InstallationLocation> {
        self.secrets.get(api_key)
    }

    pub fn remove(&mut self, location: &InstallationLocation) {
        self.secrets.retain(|_, loc| loc != location);
    }
}
