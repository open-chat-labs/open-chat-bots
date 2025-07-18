use crate::types::{CanisterId, InstallationLocation};
use rand::{rngs::StdRng, Rng};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default)]
pub struct InstallationSecrets {
    secrets: HashMap<String, Record>,
}

impl InstallationSecrets {
    pub fn new() -> Self {
        InstallationSecrets::default()
    }

    pub fn generate(
        &mut self,
        api_gateway: CanisterId,
        location: InstallationLocation,
        rng: &mut StdRng,
    ) -> String {
        let secret = rng.gen::<u128>().to_string();
        self.secrets.insert(
            secret.clone(),
            Record {
                api_gateway,
                location,
            },
        );
        secret
    }

    pub fn lookup(&self, secret: &str) -> Option<(CanisterId, InstallationLocation)> {
        self.secrets
            .get(secret)
            .map(|record| (record.api_gateway, record.location))
    }

    pub fn remove(&mut self, location: InstallationLocation) {
        self.secrets.retain(|_, record| record.location != location);
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct Record {
    api_gateway: CanisterId,
    location: InstallationLocation,
}
