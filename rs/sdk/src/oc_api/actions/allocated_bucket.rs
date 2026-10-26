use crate::oc_api::actions::ActionDef;
use crate::types::{CanisterId, Hash};
use serde::{Deserialize, Serialize};

/// Asks OpenChat's StorageIndex which StorageBucket to upload a file to, and the file's id there.
/// The caller must be a registered user or bot, whose upload allowance the file counts against.
pub struct AllocatedBucketAction;

impl ActionDef for AllocatedBucketAction {
    type Args = Args;
    type Response = Response;

    fn method_name(_: bool) -> &'static str {
        "allocated_bucket_v2"
    }

    fn is_query() -> bool {
        true
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Args {
    /// The file's SHA3-256 hash
    pub file_hash: Hash,
    pub file_size: u64,
    /// Mixed into the file's id, so uploading the same file twice gives two ids
    pub file_id_seed: Option<u128>,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Success(SuccessResult),
    AllowanceExceeded(ProjectedAllowance),
    UserNotFound,
    BucketUnavailable,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SuccessResult {
    pub canister_id: CanisterId,
    pub file_id: u128,
    pub chunk_size: u32,
    pub projected_allowance: ProjectedAllowance,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ProjectedAllowance {
    pub byte_limit: u64,
    pub bytes_used: u64,
    pub bytes_used_after_upload: u64,
    pub bytes_used_after_operation: u64,
}
