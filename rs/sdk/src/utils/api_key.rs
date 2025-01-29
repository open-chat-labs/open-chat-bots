use crate::types::CanisterId;
use base64::Engine;
use candid::Deserialize;

pub fn extract_gateway_from_api_key(
    api_key: &str,
) -> Result<CanisterId, Box<dyn std::error::Error + Sync + Send>> {
    let json = base64::engine::general_purpose::STANDARD_NO_PAD.decode(api_key)?;
    let result: ApiKeyDecodedGatewayOnly = serde_json::from_slice(&json)?;
    Ok(result.gateway)
}

#[derive(Deserialize)]
struct ApiKeyDecodedGatewayOnly {
    gateway: CanisterId,
}
