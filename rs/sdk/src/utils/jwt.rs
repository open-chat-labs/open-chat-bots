use ct_codecs::{Base64UrlSafeNoPadding, Decoder};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::error::Error;

use crate::types::{TimestampMillis, TokenError};
use crate::utils::ecdsa;

#[derive(Serialize, Deserialize)]
pub struct Claims<T> {
    exp: u64,
    claim_type: String,
    #[serde(flatten)]
    custom: T,
}

impl<T> Claims<T> {
    pub fn new(expiry: TimestampMillis, claim_type: String, custom: T) -> Claims<T> {
        Claims {
            exp: expiry / 1000,
            claim_type,
            custom,
        }
    }

    pub fn exp(&self) -> u64 {
        self.exp
    }

    pub fn exp_ms(&self) -> TimestampMillis {
        self.exp * 1000
    }

    pub fn claim_type(&self) -> &str {
        &self.claim_type
    }

    pub fn custom(&self) -> &T {
        &self.custom
    }

    pub fn into_custom(self) -> T {
        self.custom
    }
}

pub fn verify<T: DeserializeOwned>(jwt: &str, public_key_pem: &str) -> Result<T, Box<dyn Error>> {
    let mut parts = jwt.split('.');
    let header_json = parts.next().ok_or("Invalid jwt")?;
    let claims_json = parts.next().ok_or("Invalid jwt")?;
    let authenticated = format!("{header_json}.{claims_json}");
    let signature_str = parts.next().ok_or("Invalid jwt")?;

    ecdsa::verify_payload(authenticated.as_bytes(), signature_str, public_key_pem)?;

    decode_claims(claims_json)
}

/// Verifies a token as [`verify`] does, and that it has the claim type expected and hasn't expired,
/// giving its claims. A token for another purpose is refused, as each signer signs all its tokens
/// with the same key.
pub(crate) fn verify_claims<T: DeserializeOwned>(
    jwt: &str,
    public_key_pem: &str,
    claim_type: &str,
    now: TimestampMillis,
) -> Result<T, TokenError> {
    let claims = verify::<Claims<T>>(jwt, public_key_pem)
        .map_err(|error| TokenError::Invalid(error.to_string()))?;

    if claims.claim_type() != claim_type {
        return Err(TokenError::Invalid(format!(
            "Expected a {claim_type} token, got {}",
            claims.claim_type()
        )));
    }

    if claims.exp_ms() <= now {
        return Err(TokenError::Expired);
    }

    Ok(claims.into_custom())
}

/// A token's claims, without verifying it, so only for a token the bot holds itself, eg. to see
/// when one it was given expires. Never trust what they say.
pub fn decode_unverified<T: DeserializeOwned>(jwt: &str) -> Result<T, Box<dyn Error>> {
    decode_claims(jwt.split('.').nth(1).ok_or("Invalid jwt")?)
}

fn decode_claims<T: DeserializeOwned>(claims_json: &str) -> Result<T, Box<dyn Error>> {
    let bytes = Base64UrlSafeNoPadding::decode_to_vec(claims_json, None)?;

    Ok(serde_json::from_slice(&bytes)?)
}

// Tokens signed as OpenChat and its MiniApp service sign them, with ES256, by a key which stands in
// for the signer's
#[cfg(test)]
pub(crate) mod test_tokens {
    use ct_codecs::{Base64UrlSafeNoPadding, Encoder};
    use p256::ecdsa::signature::Signer;
    use p256::ecdsa::{Signature, SigningKey};
    use p256::pkcs8::{EncodePublicKey, LineEnding};

    pub fn signing_key() -> SigningKey {
        SigningKey::from_slice(&[7; 32]).unwrap()
    }

    // Not the signer's
    pub fn other_signing_key() -> SigningKey {
        SigningKey::from_slice(&[8; 32]).unwrap()
    }

    pub fn public_key_pem() -> String {
        signing_key()
            .verifying_key()
            .to_public_key_pem(LineEnding::LF)
            .unwrap()
    }

    pub fn sign(key: &SigningKey, claims_json: &str) -> String {
        let header = encode(br#"{"alg":"ES256"}"#);
        let claims = encode(claims_json.as_bytes());
        let signature: Signature = key.sign(format!("{header}.{claims}").as_bytes());
        format!("{header}.{claims}.{}", encode(&signature.to_bytes()))
    }

    fn encode(bytes: &[u8]) -> String {
        Base64UrlSafeNoPadding::encode_to_string(bytes).unwrap()
    }
}
