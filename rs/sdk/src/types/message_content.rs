use super::{TimestampMillis, UserId};
use crate::utils::{serialize_large_uint, serialize_principal_as_bytes};
use candid::{CandidType, Principal};
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum MessageContentInitial {
    Text(TextContent),
    Image(ImageContent),
    Video(VideoContent),
    Audio(AudioContent),
    File(FileContent),
    Poll(PollContent),
    Giphy(GiphyContent),
    Custom(CustomContent),
}

impl MessageContentInitial {
    pub fn from_text(text: String) -> Self {
        MessageContentInitial::Text(TextContent { text })
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub enum MessageContent {
    Text(TextContent),
    Image(ImageContent),
    Video(VideoContent),
    Audio(AudioContent),
    File(FileContent),
    Poll(PollContent),
    Deleted(DeletedBy),
    Giphy(GiphyContent),
    Custom(CustomContent),
    Unsupported(UnsupportedContent),
}

impl MessageContent {
    pub fn text(&self) -> Option<&str> {
        match self {
            MessageContent::Text(t) => Some(t.text.as_str()),
            MessageContent::Image(i) => i.caption.as_deref(),
            MessageContent::Video(v) => v.caption.as_deref(),
            MessageContent::Audio(a) => a.caption.as_deref(),
            MessageContent::File(f) => f.caption.as_deref(),
            MessageContent::Poll(p) => p.config.text.as_deref(),
            MessageContent::Giphy(g) => g.caption.as_deref(),
            MessageContent::Deleted(_)
            | MessageContent::Unsupported(_)
            | MessageContent::Custom(_) => None,
        }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct TextContent {
    pub text: String,
}

impl From<String> for TextContent {
    fn from(value: String) -> Self {
        TextContent { text: value }
    }
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ImageContent {
    pub width: u32,
    pub height: u32,
    pub thumbnail_data: ThumbnailData,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blob_reference: Option<BlobReference>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GiphyImageVariant {
    pub width: u32,
    pub height: u32,
    pub url: String,
    pub mime_type: String,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GiphyContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    pub title: String,
    pub desktop: GiphyImageVariant,
    pub mobile: GiphyImageVariant,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct VideoContent {
    pub width: u32,
    pub height: u32,
    pub thumbnail_data: ThumbnailData,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_blob_reference: Option<BlobReference>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_blob_reference: Option<BlobReference>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct AudioContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blob_reference: Option<BlobReference>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct FileContent {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    pub mime_type: String,
    pub file_size: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blob_reference: Option<BlobReference>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct PollContent {
    pub config: PollConfig,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct PollConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub options: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_date: Option<TimestampMillis>,
    pub anonymous: bool,
    pub show_votes_before_end_date: bool,
    pub allow_multiple_votes_per_user: bool,
    pub allow_user_to_change_vote: bool,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ThumbnailData(pub String);

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BlobReference {
    #[serde(serialize_with = "serialize_principal_as_bytes")]
    pub canister_id: Principal,
    #[serde(serialize_with = "serialize_large_uint")]
    pub blob_id: u128,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct DeletedBy {
    pub deleted_by: UserId,
    pub timestamp: TimestampMillis,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct CustomContent {
    pub kind: String,
    pub data: Vec<u8>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct UnsupportedContent {
    pub kind: String,
}
