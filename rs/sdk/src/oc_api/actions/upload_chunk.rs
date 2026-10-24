use crate::oc_api::actions::ActionDef;
use crate::types::{CanisterId, Hash, TimestampMillis};
use serde::{Deserialize, Serialize};

/// Uploads one chunk of a file to the StorageBucket that `AllocatedBucketAction` chose. The file is
/// complete once all its chunks are.
pub struct UploadChunkAction;

impl ActionDef for UploadChunkAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "upload_chunk_v2"
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    pub file_id: u128,
    pub hash: Hash,
    pub mime_type: String,
    /// The canisters whose messages refer to the file, eg. the group's. It's deleted once none do.
    pub accessors: Vec<CanisterId>,
    pub chunk_index: u32,
    pub chunk_size: u32,
    pub total_size: u64,
    #[serde(with = "serde_bytes")]
    pub bytes: Vec<u8>,
    pub expiry: Option<TimestampMillis>,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
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
