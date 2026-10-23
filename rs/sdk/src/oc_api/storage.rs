//! Uploading files to OpenChat's storage, as the bot's own principal, which OpenChat gives a storage
//! allowance when the bot is registered. A file is public: anyone with its url can fetch it.

use crate::oc_api::Runtime;
use crate::types::{BlobReference, CallError, CanisterId, TimestampMillis};
use crate::utils::serialize_large_uint;
use ic_principal::Principal;
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize, Serializer};
use sha3::{Digest, Sha3_256};
use std::fmt::{Display, Formatter};

pub type FileHash = [u8; 32];

#[derive(Debug)]
pub enum UploadError {
    Call(CallError),
    /// The bot's storage allowance would be exceeded
    AllowanceExceeded,
    /// OpenChat has no record of the bot's principal, eg. as the bot isn't registered
    UserNotFound,
    BucketUnavailable,
    /// The bucket refused a chunk, eg. `HashMismatch`
    Chunk(String),
}

impl Display for UploadError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            UploadError::Call((code, message)) => write!(f, "Call failed: {code} {message}"),
            UploadError::AllowanceExceeded => write!(f, "The bot's storage allowance is used up"),
            UploadError::UserNotFound => write!(f, "OpenChat's storage doesn't know the bot"),
            UploadError::BucketUnavailable => write!(f, "No storage bucket is available"),
            UploadError::Chunk(error) => write!(f, "A chunk was refused: {error}"),
        }
    }
}

impl std::error::Error for UploadError {}

/// Uploads `bytes` to OpenChat's storage, returning where the file is, eg. to give as a message's
/// or profile's `BlobReference`
pub async fn upload_file<R: Runtime>(
    runtime: &R,
    storage_index: CanisterId,
    bytes: &[u8],
    mime_type: &str,
) -> Result<BlobReference, UploadError> {
    let hash: FileHash = Sha3_256::digest(bytes).into();
    let total_size = bytes.len() as u64;

    let response: AllocatedBucketResponse = runtime
        .query_canister(
            storage_index,
            "allocated_bucket_v2_msgpack",
            AllocatedBucketArgs {
                file_hash: hash,
                file_size: total_size,
                // The StorageIndex mixes in the time, which keeps file ids distinct without a seed
                file_id_seed: None,
            },
        )
        .await
        .map_err(UploadError::Call)?;
    let allocated = match response {
        AllocatedBucketResponse::Success(allocated) => allocated,
        AllocatedBucketResponse::AllowanceExceeded(_) => {
            return Err(UploadError::AllowanceExceeded);
        }
        AllocatedBucketResponse::UserNotFound => return Err(UploadError::UserNotFound),
        AllocatedBucketResponse::BucketUnavailable => return Err(UploadError::BucketUnavailable),
    };

    // An empty file is still uploaded as one chunk
    let chunk_size = allocated.chunk_size as usize;
    let chunks: Vec<&[u8]> = if bytes.is_empty() {
        vec![bytes]
    } else {
        bytes.chunks(chunk_size).collect()
    };
    for (index, chunk) in chunks.into_iter().enumerate() {
        let response: UploadChunkResponse = runtime
            .call_canister(
                allocated.canister_id,
                "upload_chunk_v2_msgpack",
                UploadChunkArgs {
                    file_id: allocated.file_id,
                    hash,
                    mime_type: mime_type.to_string(),
                    accessors: Vec::new(),
                    chunk_index: index as u32,
                    chunk_size: allocated.chunk_size,
                    total_size,
                    bytes: chunk.to_vec(),
                    expiry: None,
                },
            )
            .await
            .map_err(UploadError::Call)?;
        match response {
            UploadChunkResponse::Success => {}
            UploadChunkResponse::AllowanceExceeded => return Err(UploadError::AllowanceExceeded),
            UploadChunkResponse::UserNotFound => return Err(UploadError::UserNotFound),
            other => return Err(UploadError::Chunk(format!("{other:?}"))),
        }
    }

    Ok(BlobReference {
        canister_id: allocated.canister_id.into(),
        blob_id: allocated.file_id,
    })
}

// The StorageIndex's `allocated_bucket_v2`

#[derive(Serialize)]
struct AllocatedBucketArgs {
    file_hash: FileHash,
    file_size: u64,
    file_id_seed: Option<u128>,
}

#[derive(Deserialize, Debug)]
enum AllocatedBucketResponse {
    Success(AllocatedBucket),
    AllowanceExceeded(IgnoredAny),
    UserNotFound,
    BucketUnavailable,
}

#[derive(Deserialize, Debug)]
struct AllocatedBucket {
    canister_id: CanisterId,
    file_id: u128,
    chunk_size: u32,
}

// A StorageBucket's `upload_chunk_v2`

#[derive(Serialize)]
struct UploadChunkArgs {
    #[serde(serialize_with = "serialize_large_uint")]
    file_id: u128,
    hash: FileHash,
    mime_type: String,
    accessors: Vec<Principal>,
    chunk_index: u32,
    chunk_size: u32,
    total_size: u64,
    #[serde(serialize_with = "serialize_as_bytes")]
    bytes: Vec<u8>,
    expiry: Option<TimestampMillis>,
}

#[derive(Deserialize, Debug)]
enum UploadChunkResponse {
    Success,
    AllowanceExceeded,
    FileAlreadyExists,
    FileTooBig,
    FileExpired,
    ChunkAlreadyExists,
    ChunkIndexTooHigh,
    ChunkSizeMismatch,
    Full,
    HashMismatch,
    InvalidFileId,
    UserNotFound,
    Blocked,
}

// As msgpack's bin, which the bucket reads with serde_bytes, rather than an array of numbers
fn serialize_as_bytes<S: Serializer>(bytes: &[u8], serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_bytes(bytes)
}
