use ct_codecs::{Base64UrlSafeNoPadding, Decoder};
use p256::ecdsa::signature::Verifier;
use p256::ecdsa::{self};
use p256::pkcs8::DecodePublicKey;
use std::error::Error;

pub fn verify_payload(
    payload: &[u8],
    signature_str: &str,
    public_key_pem: &str,
) -> Result<(), Box<dyn Error>> {
    let signature_bytes = Base64UrlSafeNoPadding::decode_to_vec(signature_str, None)?;
    let signature = ecdsa::Signature::from_slice(&signature_bytes)?;

    let verifying_key = ecdsa::VerifyingKey::from_public_key_pem(public_key_pem)
        .map_err(|e| format!("OC public key invalid: {e}"))?;

    verifying_key.verify(payload, &signature)?;

    Ok(())
}
