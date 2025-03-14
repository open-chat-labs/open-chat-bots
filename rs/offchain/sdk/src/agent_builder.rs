use ic_agent::identity::{BasicIdentity, Secp256k1Identity};
use ic_agent::{Agent, Identity};

pub async fn build_agent(url: String, pem_file: &str) -> Agent {
    let identity = load_identity_from_pem_file(pem_file);
    let mainnet = is_mainnet(&url);
    let timeout = std::time::Duration::from_secs(60);

    let agent = Agent::builder()
        .with_url(url)
        .with_boxed_identity(identity)
        .with_ingress_expiry(timeout)
        .build()
        .expect("Failed to build IC agent");

    if !mainnet {
        agent
            .fetch_root_key()
            .await
            .expect("Couldn't fetch root key");
    }

    agent
}

fn is_mainnet(url: &str) -> bool {
    url.contains("ic0.app")
}

fn load_identity_from_pem_file(pem_file: &str) -> Box<dyn Identity> {
    if !matches!(std::fs::exists(pem_file), Ok(true)) {
        panic!("PEM file does not exist");
    }
    if let Ok(identity) = BasicIdentity::from_pem_file(pem_file) {
        Box::new(identity)
    } else if let Ok(identity) = Secp256k1Identity::from_pem_file(pem_file) {
        Box::new(identity)
    } else {
        panic!("Failed to create identity from pem");
    }
}
