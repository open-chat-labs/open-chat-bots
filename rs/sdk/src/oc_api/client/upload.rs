use super::Client;
use crate::oc_api::Runtime;
use crate::oc_api::actions::allocated_bucket::{self, AllocatedBucketAction};
use crate::oc_api::actions::call_action;
use crate::oc_api::actions::upload_chunk::{self, UploadChunkAction};
use crate::types::{
    ActionContext, ActionScope, BlobReference, CallError, CanisterId, ImageContent,
};
use crate::utils::create_thumbnail;
use sha3::{Digest, Sha3_256};
use std::fmt::{Display, Formatter};
use std::sync::atomic::{AtomicU64, Ordering};

// Each chunk is tried this many times, as a failed call may have landed anyway
const UPLOAD_CHUNK_ATTEMPTS: usize = 3;

static UPLOADS: AtomicU64 = AtomicU64::new(0);

impl<R: Runtime, C: ActionContext> Client<R, C> {
    /// Uploads `data` to OpenChat's storage as the bot, for a message in the chat the client acts
    /// in to refer to. That chat is recorded as the file's accessor, whose deletion deletes it. It
    /// counts against the bot's upload allowance, which OpenChat gives it when it's registered.
    /// `storage_index` is OpenChat's StorageIndex, eg. `mainnet::mainnet_storage_index_canister_id()`.
    pub async fn upload_blob(
        &self,
        storage_index: CanisterId,
        mime_type: String,
        data: Vec<u8>,
    ) -> Result<BlobReference, UploadError> {
        let hash: [u8; 32] = Sha3_256::digest(&data).into();
        let total_size = data.len() as u64;
        // OpenChat mixes the time into the file's id, so this only has to differ between uploads
        // of the same file at once
        let seed = ((UPLOADS.fetch_add(1, Ordering::Relaxed) as u128) << 64)
            | self.context.message_id().map_or(0, |id| *id as u128);

        let bucket = match call_action::<AllocatedBucketAction, R>(
            &*self.runtime,
            storage_index,
            allocated_bucket::Args {
                file_hash: hash,
                file_size: total_size,
                file_id_seed: Some(seed),
            },
        )
        .await
        .map_err(UploadError::Call)?
        {
            allocated_bucket::Response::Success(result) => result,
            response => return Err(UploadError::AllocateBucket(response)),
        };

        let accessor = match self.context.scope() {
            ActionScope::Chat(chat) => chat.canister_id(),
            ActionScope::Community(community_id) => community_id,
        };

        let chunks = data.chunks(bucket.chunk_size as usize);
        for (chunk_index, bytes) in chunks.enumerate() {
            let args = upload_chunk::Args {
                file_id: bucket.file_id,
                hash,
                mime_type: mime_type.clone(),
                accessors: vec![accessor],
                chunk_index: chunk_index as u32,
                chunk_size: bucket.chunk_size,
                total_size,
                bytes: bytes.to_vec(),
                expiry: None,
            };
            self.upload_chunk(bucket.canister_id, args).await?;
        }

        Ok(BlobReference {
            canister_id: bucket.canister_id.into(),
            blob_id: bucket.file_id,
        })
    }

    /// Uploads an image as [`Self::upload_blob`] does, and returns the content of a message showing
    /// it, with a thumbnail to show while it loads. Only PNGs can be read, for now.
    pub async fn upload_image(
        &self,
        storage_index: CanisterId,
        data: Vec<u8>,
        format: image::ImageFormat,
    ) -> Result<ImageContent, UploadError> {
        let image = image::load_from_memory_with_format(&data, format)
            .map_err(|error| UploadError::InvalidImage(error.to_string()))?;
        let thumbnail_data = create_thumbnail(&data, format)
            .map_err(|error| UploadError::InvalidImage(error.to_string()))?;
        let mime_type = format.to_mime_type().to_string();

        let blob_reference = self
            .upload_blob(storage_index, mime_type.clone(), data)
            .await?;

        Ok(ImageContent {
            width: image.width(),
            height: image.height(),
            thumbnail_data,
            caption: None,
            mime_type,
            blob_reference: Some(blob_reference),
        })
    }

    async fn upload_chunk(
        &self,
        bucket: CanisterId,
        args: upload_chunk::Args,
    ) -> Result<(), UploadError> {
        let mut attempt = 1;
        loop {
            let response =
                call_action::<UploadChunkAction, R>(&*self.runtime, bucket, args.clone()).await;

            match response {
                Ok(upload_chunk::Response::Success) => return Ok(()),
                // An earlier attempt landed
                Ok(
                    upload_chunk::Response::ChunkAlreadyExists
                    | upload_chunk::Response::FileAlreadyExists,
                ) if attempt > 1 => return Ok(()),
                Ok(response) => return Err(UploadError::UploadChunk(response)),
                Err(error) if attempt == UPLOAD_CHUNK_ATTEMPTS => {
                    return Err(UploadError::Call(error));
                }
                Err(_) => attempt += 1,
            }
        }
    }
}

#[derive(Debug)]
pub enum UploadError {
    /// The StorageIndex didn't allocate a bucket, eg. as the bot's allowance is used up
    AllocateBucket(allocated_bucket::Response),
    /// The StorageBucket refused a chunk
    UploadChunk(upload_chunk::Response),
    Call(CallError),
    InvalidImage(String),
}

impl std::error::Error for UploadError {}

impl Display for UploadError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            UploadError::AllocateBucket(response) => {
                write!(f, "Failed to allocate a bucket: {response:?}")
            }
            UploadError::UploadChunk(response) => {
                write!(f, "Failed to upload a chunk: {response:?}")
            }
            UploadError::Call((code, message)) => write!(f, "Call failed ({code}): {message}"),
            UploadError::InvalidImage(error) => write!(f, "Invalid image: {error}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::msgpack;
    use crate::oc_api::actions::allocated_bucket::{ProjectedAllowance, SuccessResult};
    use crate::types::{AutonomousContext, CallResult, Chat, TimestampMillis};
    use ic_principal::Principal;
    use serde::{Deserialize, Serialize};
    use std::collections::VecDeque;
    use std::future::Future;
    use std::pin::pin;
    use std::sync::{Arc, Mutex};
    use std::task::{Context, Poll, Waker};

    const STORAGE_INDEX: &str = "rturd-qaaaa-aaaaf-aabaq-cai";
    const BUCKET: &str = "ryjl3-tyaaa-aaaaa-aaaba-cai";
    const GROUP: &str = "2ouva-viaaa-aaaaq-aaamq-cai";

    #[test]
    fn uploads_each_chunk_to_the_allocated_bucket() {
        let runtime = FakeRuntime::new(vec![
            Ok(msgpack::serialize_then_unwrap(allocated(4))),
            Ok(msgpack::serialize_then_unwrap(
                upload_chunk::Response::Success,
            )),
            Ok(msgpack::serialize_then_unwrap(
                upload_chunk::Response::Success,
            )),
            Ok(msgpack::serialize_then_unwrap(
                upload_chunk::Response::Success,
            )),
        ]);
        let client = client(&runtime);

        let blob = block_on(client.upload_blob(
            canister_id(STORAGE_INDEX),
            "image/png".to_string(),
            (0..10).collect(),
        ))
        .unwrap();

        assert_eq!(blob.canister_id, Principal::from_text(BUCKET).unwrap());
        assert_eq!(blob.blob_id, 7);

        let calls = runtime.calls.lock().unwrap();
        let (canister, method, args) = &calls[0];
        assert_eq!(*canister, canister_id(STORAGE_INDEX));
        assert_eq!(method, "allocated_bucket_v2_msgpack");
        let args: allocated_bucket::Args = msgpack::deserialize_then_unwrap(args);
        let hash: [u8; 32] = Sha3_256::digest((0..10).collect::<Vec<u8>>()).into();
        assert_eq!(args.file_hash, hash);
        assert_eq!(args.file_size, 10);

        let chunks: Vec<upload_chunk::Args> = calls[1..]
            .iter()
            .map(|(canister, method, args)| {
                assert_eq!(*canister, canister_id(BUCKET));
                assert_eq!(method, "upload_chunk_v2_msgpack");
                msgpack::deserialize_then_unwrap(args)
            })
            .collect();
        let bytes: Vec<Vec<u8>> = chunks.iter().map(|c| c.bytes.clone()).collect();
        assert_eq!(bytes, vec![vec![0, 1, 2, 3], vec![4, 5, 6, 7], vec![8, 9]]);
        for (index, chunk) in chunks.iter().enumerate() {
            assert_eq!(chunk.chunk_index, index as u32);
            assert_eq!(chunk.file_id, 7);
            assert_eq!(chunk.hash, hash);
            assert_eq!(chunk.chunk_size, 4);
            assert_eq!(chunk.total_size, 10);
            assert_eq!(chunk.mime_type, "image/png");
            assert_eq!(chunk.accessors, vec![canister_id(GROUP)]);
        }
    }

    #[test]
    fn a_chunk_which_may_have_landed_is_retried() {
        let runtime = FakeRuntime::new(vec![
            Ok(msgpack::serialize_then_unwrap(allocated(512))),
            Err((0, "timed out".to_string())),
            Ok(msgpack::serialize_then_unwrap(
                upload_chunk::Response::ChunkAlreadyExists,
            )),
        ]);
        let client = client(&runtime);

        let blob = block_on(client.upload_blob(
            canister_id(STORAGE_INDEX),
            "image/png".to_string(),
            vec![1, 2, 3],
        ));

        assert!(blob.is_ok());
        assert_eq!(runtime.calls.lock().unwrap().len(), 3);
    }

    #[test]
    fn a_refused_chunk_fails_the_upload() {
        let runtime = FakeRuntime::new(vec![
            Ok(msgpack::serialize_then_unwrap(allocated(512))),
            Ok(msgpack::serialize_then_unwrap(
                upload_chunk::Response::AllowanceExceeded,
            )),
        ]);
        let client = client(&runtime);

        let blob = block_on(client.upload_blob(
            canister_id(STORAGE_INDEX),
            "image/png".to_string(),
            vec![1, 2, 3],
        ));

        assert!(matches!(
            blob,
            Err(UploadError::UploadChunk(
                upload_chunk::Response::AllowanceExceeded
            ))
        ));
    }

    #[test]
    fn no_bucket_fails_the_upload() {
        let runtime = FakeRuntime::new(vec![Ok(msgpack::serialize_then_unwrap(
            allocated_bucket::Response::UserNotFound,
        ))]);
        let client = client(&runtime);

        let blob = block_on(client.upload_blob(
            canister_id(STORAGE_INDEX),
            "image/png".to_string(),
            vec![1, 2, 3],
        ));

        assert!(matches!(
            blob,
            Err(UploadError::AllocateBucket(
                allocated_bucket::Response::UserNotFound
            ))
        ));
    }

    #[test]
    fn uploads_an_image_with_its_size_and_a_thumbnail() {
        let runtime = FakeRuntime::new(vec![
            Ok(msgpack::serialize_then_unwrap(allocated(1 << 19))),
            Ok(msgpack::serialize_then_unwrap(
                upload_chunk::Response::Success,
            )),
        ]);
        let client = client(&runtime);
        let mut png = Vec::new();
        image::RgbImage::new(120, 60)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();

        let content =
            block_on(client.upload_image(canister_id(STORAGE_INDEX), png, image::ImageFormat::Png))
                .unwrap();

        assert_eq!((content.width, content.height), (120, 60));
        assert_eq!(content.mime_type, "image/png");
        assert!(
            content
                .thumbnail_data
                .0
                .starts_with("data:image/png;base64,")
        );
        assert_eq!(content.blob_reference.unwrap().blob_id, 7);
    }

    // OpenChat takes the bytes as msgpack's bin type, and principals as bytes
    #[test]
    fn upload_chunk_args_serialize_bytes_as_bin() {
        let args = upload_chunk::Args {
            file_id: 1,
            hash: [0; 32],
            mime_type: "image/png".to_string(),
            accessors: vec![CanisterId::from(Principal::anonymous())],
            chunk_index: 0,
            chunk_size: 3,
            total_size: 3,
            bytes: vec![1, 2, 3],
            expiry: None,
        };
        let serialized = msgpack::serialize_then_unwrap(&args);

        // bin8 of length 3
        assert!(serialized.windows(5).any(|w| w == [0xc4, 3, 1, 2, 3]));
        // The anonymous principal, as bin8 of length 1
        assert!(serialized.windows(2).any(|w| w == [0xc4, 1]));

        let deserialized: upload_chunk::Args = msgpack::deserialize_then_unwrap(&serialized);
        assert_eq!(deserialized.bytes, vec![1, 2, 3]);
        assert_eq!(deserialized.accessors, args.accessors);
    }

    fn allocated(chunk_size: u32) -> allocated_bucket::Response {
        allocated_bucket::Response::Success(SuccessResult {
            canister_id: canister_id(BUCKET),
            file_id: 7,
            chunk_size,
            projected_allowance: ProjectedAllowance {
                byte_limit: 1 << 30,
                bytes_used: 0,
                bytes_used_after_upload: 10,
                bytes_used_after_operation: 10,
            },
        })
    }

    fn client(runtime: &FakeRuntime) -> Client<FakeRuntime, AutonomousContext> {
        Client::new(
            Arc::new(runtime.clone()),
            AutonomousContext {
                api_gateway: canister_id(GROUP),
                scope: ActionScope::Chat(Chat::Group(canister_id(GROUP))),
            },
        )
    }

    fn canister_id(text: &str) -> CanisterId {
        Principal::from_text(text).unwrap().into()
    }

    // The fake's calls complete at once
    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = pin!(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            if let Poll::Ready(output) = future.as_mut().poll(&mut context) {
                return output;
            }
        }
    }

    // The canister, the method and the args, in msgpack
    type Call = (CanisterId, String, Vec<u8>);

    // Answers calls with the given responses, in turn, and records them
    #[derive(Clone)]
    struct FakeRuntime {
        calls: Arc<Mutex<Vec<Call>>>,
        responses: Arc<Mutex<VecDeque<CallResult<Vec<u8>>>>>,
    }

    impl FakeRuntime {
        fn new(responses: Vec<CallResult<Vec<u8>>>) -> Self {
            FakeRuntime {
                calls: Arc::default(),
                responses: Arc::new(Mutex::new(responses.into())),
            }
        }
    }

    impl Runtime for FakeRuntime {
        async fn call_canister<A: Serialize + Send, R: for<'a> Deserialize<'a>>(
            &self,
            canister_id: CanisterId,
            method_name: &str,
            args: A,
        ) -> CallResult<R> {
            self.calls.lock().unwrap().push((
                canister_id,
                method_name.to_string(),
                msgpack::serialize_then_unwrap(args),
            ));
            let response = self.responses.lock().unwrap().pop_front().unwrap();
            response.map(|bytes| msgpack::deserialize_then_unwrap(&bytes))
        }

        fn spawn<F: Future<Output = ()> + Send + 'static>(&self, _: F) {
            unimplemented!()
        }

        fn now(&self) -> TimestampMillis {
            0
        }

        fn is_canister(&self) -> bool {
            false
        }
    }
}
