use super::{
    CanisterId, Chat, CompletedCryptoTransaction, CryptoTransaction, MessageId, MessageIndex,
    Milliseconds, NnsNeuronId, OptionUpdate, ProposalId, SnsNeuronId, TimestampMillis, UserId,
    VideoCallType,
};
use crate::utils::{serialize_large_uint, serialize_principal_as_bytes, tolerant_enum};
use ic_principal::Principal;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum MessageContentInitial {
    Text(TextContent),
    Image(ImageContent),
    Video(VideoContent),
    Audio(AudioContent),
    File(FileContent),
    Poll(PollContent),
    Giphy(GiphyContent),
    Custom(CustomContent),
    PriceChart(PriceChartContent),
    MiniApp(MiniAppContent),
}

impl MessageContentInitial {
    pub fn from_text(text: String) -> Self {
        MessageContentInitial::Text(TextContent { text })
    }
}

/// A kind of content this SDK doesn't know yet decodes as `Unsupported`, with its kind
#[derive(Serialize, Clone, Debug)]
pub enum MessageContent {
    Text(TextContent),
    Image(ImageContent),
    Video(VideoContent),
    Audio(AudioContent),
    File(FileContent),
    Poll(PollContent),
    Crypto(CryptoContent),
    Deleted(DeletedBy),
    Giphy(GiphyContent),
    GovernanceProposal(ProposalContent),
    Prize(PrizeContent),
    PrizeWinner(PrizeWinnerContent),
    MessageReminderCreated(MessageReminderCreatedContent),
    MessageReminder(MessageReminderContent),
    ReportedMessage(ReportedMessage),
    ModerationReport(ModerationReportContent),
    P2PSwap(P2PSwapContent),
    VideoCall(VideoCallContent),
    Encrypted(EncryptedContent),
    Custom(CustomContent),
    PriceChart(PriceChartContent),
    MiniApp(MiniAppContent),
    Unsupported(UnsupportedContent),
}

tolerant_enum!(
    MessageContent,
    variants: [
        Text,
        Image,
        Video,
        Audio,
        File,
        Poll,
        Crypto,
        Deleted,
        Giphy,
        GovernanceProposal,
        Prize,
        PrizeWinner,
        MessageReminderCreated,
        MessageReminder,
        ReportedMessage,
        ModerationReport,
        P2PSwap,
        VideoCall,
        Encrypted,
        Custom,
        PriceChart,
        MiniApp,
        Unsupported,
    ],
    units: [],
    unknown: |kind| MessageContent::Unsupported(UnsupportedContent { kind }),
);

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
            MessageContent::GovernanceProposal(p) => Some(p.proposal.title()),
            MessageContent::Crypto(c) => c.caption.as_deref(),
            MessageContent::Prize(p) => p.caption.as_deref(),
            MessageContent::P2PSwap(s) => s.caption.as_deref(),
            MessageContent::PriceChart(c) => Some(c.title.as_str()),
            MessageContent::MiniApp(c) => Some(c.text.as_str()),
            MessageContent::Deleted(_)
            | MessageContent::PrizeWinner(_)
            | MessageContent::MessageReminderCreated(_)
            | MessageContent::MessageReminder(_)
            | MessageContent::ReportedMessage(_)
            | MessageContent::ModerationReport(_)
            | MessageContent::VideoCall(_)
            | MessageContent::Encrypted(_)
            | MessageContent::Unsupported(_)
            | MessageContent::Custom(_) => None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TextContent {
    pub text: String,
}

impl From<String> for TextContent {
    fn from(value: String) -> Self {
        TextContent { text: value }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GiphyImageVariant {
    pub width: u32,
    pub height: u32,
    pub url: String,
    pub mime_type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GiphyContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    pub title: String,
    pub desktop: GiphyImageVariant,
    pub mobile: GiphyImageVariant,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AudioContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blob_reference: Option<BlobReference>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<Milliseconds>,
    /// The waveform OpenChat draws for it, each sample's loudness from 0 to 255
    #[serde(skip_serializing_if = "Option::is_none")]
    pub samples: Option<Vec<u8>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileContent {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    pub mime_type: String,
    pub file_size: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blob_reference: Option<BlobReference>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PollContent {
    pub config: PollConfig,
    /// OpenChat ignores this on a poll a bot sends
    #[serde(default)]
    pub votes: PollVotes,
    #[serde(default)]
    pub ended: bool,
}

impl From<PollConfig> for PollContent {
    fn from(config: PollConfig) -> Self {
        PollContent {
            config,
            votes: PollVotes::default(),
            ended: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct PollVotes {
    pub total: TotalVotes,
    /// The options the user the poll was read as has voted for
    pub user: Vec<u32>,
}

/// The votes for each option, as much as the poll shows
#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum TotalVotes {
    Visible(HashMap<u32, Vec<UserId>>),
    Anonymous(HashMap<u32, u32>),
    Hidden(u32),
}

impl Default for TotalVotes {
    fn default() -> Self {
        TotalVotes::Hidden(0)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThumbnailData(pub String);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct BlobReference {
    #[serde(serialize_with = "serialize_principal_as_bytes")]
    pub canister_id: Principal,
    #[serde(serialize_with = "serialize_large_uint")]
    pub blob_id: u128,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DeletedBy {
    pub deleted_by: UserId,
    pub timestamp: TimestampMillis,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CustomContent {
    pub kind: String,
    pub data: Vec<u8>,
}

/// A chart of token prices, which OpenChat draws, so that readers can see the price at any time
/// by hovering over it, or pressing and dragging. Only bots can send one, and it needs the Image
/// permission. OpenChat refuses one beyond the limits below.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PriceChartContent {
    /// Eg. "CHAT · 30 days". It's the chart's text, in notifications, previews and search.
    pub title: String,
    /// The time drawn. Each line runs on flat from its last price to `end`.
    pub start: TimestampMillis,
    pub end: TimestampMillis,
    /// One token's prices are drawn in USD, with its high and low marked. Several tokens' are
    /// drawn as their change since `start`.
    pub series: Vec<PriceChartSeries>,
    /// Where the prices are from, credited with links under the chart
    pub sources: Vec<PriceChartSource>,
}

impl PriceChartContent {
    pub const MAX_TITLE_CHARS: usize = 100;
    pub const MAX_SERIES: usize = 5;
    /// Across all the series
    pub const MAX_POINTS: usize = 1_000;
    pub const MAX_SOURCES: usize = 3;
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PriceChartSeries {
    pub token: PriceChartToken,
    /// Up to 20 characters, eg. ckBTC
    pub symbol: String,
    /// Up to 50 characters
    pub name: String,
    /// Each time and its price in USD, as the price service's histories give them: the times
    /// strictly increasing, between the chart's `start` and `end`, and the prices above 0
    pub points: Vec<(TimestampMillis, f64)>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum PriceChartToken {
    /// A token on the Internet Computer, by its ledger
    Ledger(CanisterId),
    /// Any other coin, by its CoinGecko id, eg. "cardano"
    Coin(String),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PriceChartSource {
    pub name: String,
    /// An https url
    pub url: String,
}

/// A bot's card for an app it hosts, eg. a game. OpenChat shows the text, under the image if it has
/// one, with the players, whose move it is or the result, and an Open button, which opens the bot's
/// app, served by the bot at `/app` under its endpoint, in a frame. Everything else the app shows,
/// eg. a board and buttons, is the bot's own page.
///
/// Its text, image, player limit and whether others can watch are set when it's posted and never
/// change: OpenChat refuses an edit of it. Its status, players, whose move it is and the result are
/// the bot's to keep up to date, with `Client::update_mini_app`, until the game is finished.
///
/// Only a bot installed in the chat can send one, and it needs `MessagePermission::MiniApp`. It
/// can't be sent in a direct chat, nor forwarded, as the bot knows its app's state by the card's
/// message id.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct MiniAppContent {
    /// Markdown, eg. "**Tic-tac-toe** · tap Open to play", of 1 to 2,000 characters. It's the
    /// message's text in notifications, previews and search.
    pub text: String,
    /// Shown above the text, eg. the game's artwork
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<MiniAppImage>,
    /// The most who can play, 1 to 100, if there's a limit, so the card can show eg. "2 of 4"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_players: Option<u32>,
    /// Whether members who aren't playing can open the app once the game has started
    #[serde(default)]
    pub spectators: bool,
    /// How many members who aren't playing have the app open, as the bot reports it, so that they
    /// stay anonymous. It's 0 unless `spectators` is set.
    #[serde(default)]
    pub spectator_count: u32,
    #[serde(default)]
    pub status: MiniAppStatus,
    /// The members playing, in the bot's order, at most `max_players` (or 100), each once. The bot
    /// itself can be one.
    #[serde(default)]
    pub players: Vec<UserId>,
    /// The players whose move it is, if the game has turns
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub waiting_for: Option<Vec<UserId>>,
    /// eg. "Bob won", of 1 to 200 characters, once the game is finished
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
}

/// A card's image, which the bot uploads to OpenChat's storage first, as for an image message, eg.
/// with `Client::upload_mini_app_image`, so that it's scanned like any image and deleted with the
/// message
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct MiniAppImage {
    pub width: u32,
    pub height: u32,
    /// eg. "image/png"
    pub mime_type: String,
    pub blob_reference: BlobReference,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum MiniAppStatus {
    /// Taking players
    #[default]
    Open,
    /// Being played
    Active,
    /// Over, after which the card never changes
    Finished,
}

/// What `Client::update_mini_app` changes on a card. Whatever isn't set stays as it was.
///
/// ```ignore
/// // Bob joins, and the game starts with Alice to move
/// let update = MiniAppUpdate::default()
///     .with_players(vec![alice, bob])
///     .with_status(MiniAppStatus::Active)
///     .with_waiting_for(Some(vec![alice]));
/// ```
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct MiniAppUpdate {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<MiniAppStatus>,
    /// Replaces the players
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub players: Option<Vec<UserId>>,
    /// How many members who aren't playing have the app open
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spectator_count: Option<u32>,
    #[serde(default, skip_serializing_if = "OptionUpdate::is_no_change")]
    pub waiting_for: OptionUpdate<Vec<UserId>>,
    #[serde(default, skip_serializing_if = "OptionUpdate::is_no_change")]
    pub result: OptionUpdate<String>,
}

impl MiniAppContent {
    pub const MAX_TEXT_CHARS: usize = 2_000;
    pub const MAX_PLAYERS: usize = 100;
    pub const MAX_RESULT_CHARS: usize = 200;

    /// A card without an image, open, with no players yet, which only the players can open once the
    /// game has started
    pub fn new(text: impl Into<String>) -> Self {
        MiniAppContent {
            text: text.into(),
            image: None,
            max_players: None,
            spectators: false,
            spectator_count: 0,
            status: MiniAppStatus::Open,
            players: Vec::new(),
            waiting_for: None,
            result: None,
        }
    }

    pub fn with_image(mut self, image: MiniAppImage) -> Self {
        self.image = Some(image);
        self
    }

    /// The most who can play, 1 to 100
    pub fn with_max_players(mut self, max_players: u32) -> Self {
        self.max_players = Some(max_players);
        self
    }

    /// Whether members who aren't playing can open the app once the game has started
    pub fn with_spectators(mut self, spectators: bool) -> Self {
        self.spectators = spectators;
        self
    }

    /// The players when the card is posted, eg. the member who ran the command
    pub fn with_players(mut self, players: Vec<UserId>) -> Self {
        self.players = players;
        self
    }

    /// Checks the card as OpenChat does, so that a mistake shows up before it's sent. The errors
    /// are those OpenChat gives.
    pub fn validate(&self) -> Result<(), String> {
        check_chars("text", &self.text, Self::MAX_TEXT_CHARS)?;
        if let Some(image) = &self.image {
            image.validate()?;
        }
        if self
            .max_players
            .is_some_and(|max| max == 0 || max as usize > Self::MAX_PLAYERS)
        {
            return Err(format!(
                "A game has 1 to {} players at most",
                Self::MAX_PLAYERS
            ));
        }
        let limit = self
            .max_players
            .map_or(Self::MAX_PLAYERS, |max| max as usize);
        if self.players.len() > limit {
            return Err(format!("This game has at most {limit} players"));
        }
        if self.players.iter().collect::<HashSet<_>>().len() < self.players.len() {
            return Err("A player is listed twice".to_string());
        }
        if self.spectator_count > 0 && !self.spectators {
            return Err("Only a game open to spectators has any".to_string());
        }
        if self
            .waiting_for
            .iter()
            .flatten()
            .any(|user_id| !self.players.contains(user_id))
        {
            return Err("Only players can be waited for".to_string());
        }
        if let Some(result) = &self.result {
            if self.status != MiniAppStatus::Finished {
                return Err("Only a finished game has a result".to_string());
            }
            check_chars("result", result, Self::MAX_RESULT_CHARS)?;
        }
        Ok(())
    }

    /// The card as OpenChat leaves it after `update`, eg. to `validate` an update before sending it.
    /// OpenChat also refuses any update of a finished card.
    pub fn apply(&mut self, update: MiniAppUpdate) {
        if let Some(status) = update.status {
            self.status = status;
        }
        if let Some(players) = update.players {
            self.players = players;
        }
        if let Some(spectator_count) = update.spectator_count {
            self.spectator_count = spectator_count;
        }
        self.waiting_for = update.waiting_for.apply_to(self.waiting_for.take());
        self.result = update.result.apply_to(self.result.take());
    }
}

impl MiniAppImage {
    /// Checks the image as OpenChat does: it has a width and a height, and an image's mime type
    pub fn validate(&self) -> Result<(), String> {
        Self::check(self.width, self.height, &self.mime_type)
    }

    pub(crate) fn check(width: u32, height: u32, mime_type: &str) -> Result<(), String> {
        if width == 0 || height == 0 {
            return Err("The image must have a width and a height".to_string());
        }
        if !mime_type.starts_with("image/") {
            return Err("The image's mime type must be an image's".to_string());
        }
        Ok(())
    }
}

impl MiniAppUpdate {
    pub fn with_status(mut self, status: MiniAppStatus) -> Self {
        self.status = Some(status);
        self
    }

    /// Replaces the players
    pub fn with_players(mut self, players: Vec<UserId>) -> Self {
        self.players = Some(players);
        self
    }

    /// How many members who aren't playing have the app open, which only a card open to
    /// spectators can have
    pub fn with_spectator_count(mut self, spectator_count: u32) -> Self {
        self.spectator_count = Some(spectator_count);
        self
    }

    /// Whose move it is, or `None` for no one's
    pub fn with_waiting_for(mut self, waiting_for: Option<Vec<UserId>>) -> Self {
        self.waiting_for = waiting_for.map_or(OptionUpdate::SetToNone, OptionUpdate::SetToSome);
        self
    }

    /// The game's result, eg. "Bob won", which only a finished game can have
    pub fn with_result(mut self, result: impl Into<String>) -> Self {
        self.result = OptionUpdate::SetToSome(result.into());
        self
    }

    /// Finishes the game with its result, and waits for no one
    pub fn finished(result: impl Into<String>) -> Self {
        MiniAppUpdate::default()
            .with_status(MiniAppStatus::Finished)
            .with_waiting_for(None)
            .with_result(result)
    }
}

// As OpenChat checks text: not blank, and at most `max` characters
fn check_chars(field: &str, value: &str, max: usize) -> Result<(), String> {
    if value.trim().is_empty() || value.chars().count() > max {
        Err(format!("The {field} must have 1 to {max} characters"))
    } else {
        Ok(())
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UnsupportedContent {
    pub kind: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CryptoContent {
    pub recipient: UserId,
    pub transfer: CryptoTransaction,
    pub caption: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProposalContent {
    pub governance_canister_id: CanisterId,
    pub proposal: Proposal,
    pub my_vote: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum Proposal {
    NNS(NnsProposal),
    SNS(SnsProposal),
}

impl Proposal {
    pub fn title(&self) -> &str {
        match self {
            Proposal::NNS(p) => &p.title,
            Proposal::SNS(p) => &p.title,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NnsProposal {
    pub id: ProposalId,
    pub topic: i32,
    pub proposer: NnsNeuronId,
    pub created: TimestampMillis,
    pub title: String,
    pub summary: String,
    pub url: String,
    pub status: ProposalDecisionStatus,
    pub reward_status: ProposalRewardStatus,
    pub tally: Tally,
    pub deadline: TimestampMillis,
    pub payload_text_rendering: Option<String>,
    pub last_updated: TimestampMillis,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SnsProposal {
    pub id: ProposalId,
    pub action: u64,
    pub proposer: SnsNeuronId,
    pub created: TimestampMillis,
    pub title: String,
    pub summary: String,
    pub url: String,
    pub status: ProposalDecisionStatus,
    pub reward_status: ProposalRewardStatus,
    pub tally: Tally,
    pub deadline: TimestampMillis,
    pub payload_text_rendering: Option<String>,
    pub minimum_yes_proportion_of_total: u32,
    pub minimum_yes_proportion_of_exercised: u32,
    pub last_updated: TimestampMillis,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProposalDecisionStatus {
    Unspecified,
    Open,
    Rejected,
    Adopted,
    Executed,
    Failed,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProposalRewardStatus {
    Unspecified,
    AcceptVotes,
    ReadyToSettle,
    Settled,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Tally {
    pub yes: u64,
    pub no: u64,
    pub total: u64,
    pub timestamp: TimestampMillis,
}

/// Prizes for members to claim. Their amounts aren't shown until they're claimed.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PrizeContent {
    pub prizes_remaining: u32,
    pub prizes_pending: u32,
    pub winner_count: u32,
    pub user_is_winner: bool,
    pub token_symbol: String,
    pub ledger: CanisterId,
    pub end_date: TimestampMillis,
    pub caption: Option<String>,
    pub diamond_only: bool,
    pub lifetime_diamond_only: bool,
    pub unique_person_only: bool,
    pub streak_only: u16,
    pub requires_captcha: bool,
    pub min_chit_earned: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PrizeWinnerContent {
    pub winner: UserId,
    pub transaction: CompletedCryptoTransaction,
    pub prize_message: MessageIndex,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MessageReminderCreatedContent {
    pub reminder_id: u64,
    pub remind_at: TimestampMillis,
    pub notes: Option<String>,
    pub hidden: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MessageReminderContent {
    pub reminder_id: u64,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ReportedMessage {
    pub reports: Vec<MessageReport>,
    pub count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MessageReport {
    pub reported_by: UserId,
    pub timestamp: TimestampMillis,
    pub reason_code: u32,
    pub notes: Option<String>,
}

/// A moderation alert, which OpenChat posts in its internal moderation channel
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModerationReportContent {
    pub report_index: Option<u64>,
    pub chat_id: Chat,
    pub thread_root_message_index: Option<MessageIndex>,
    pub message_index: MessageIndex,
    pub message_id: MessageId,
    pub sender: UserId,
    /// Empty if the automated moderation raised it
    pub reporters: Vec<UserId>,
    pub flagged_categories: u32,
    #[serde(default)]
    pub classification_failed: bool,
    pub auto_sanctioned: bool,
    pub content_excerpt: Option<String>,
    #[serde(default)]
    pub blob_references: Vec<BlobReference>,
    #[serde(default)]
    pub media_matches: Vec<MediaScanMatch>,
    #[serde(default)]
    pub is_blocked_attempt: bool,
    pub reported_at: TimestampMillis,
    pub status: ModerationReportStatus,
    #[serde(default)]
    pub authority_report: Option<AuthorityReportState>,
}

/// A state this SDK doesn't know yet decodes as `Unsupported`, with its name
#[derive(Serialize, Clone, Debug)]
pub enum ModerationReportStatus {
    Pending,
    Contested,
    Upheld(ModerationReportResolution),
    UpheldAsCsam(ModerationReportResolution),
    Dismissed(ModerationReportResolution),
    Unsupported(String),
}

tolerant_enum!(
    ModerationReportStatus,
    variants: [Upheld, UpheldAsCsam, Dismissed, Unsupported],
    units: [Pending, Contested],
    unknown: |kind| ModerationReportStatus::Unsupported(kind),
);

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct ModerationReportResolution {
    pub moderator: UserId,
    pub timestamp: TimestampMillis,
}

/// A state this SDK doesn't know yet decodes as `Unsupported`, with its name
#[derive(Serialize, Clone, Debug)]
pub enum AuthorityReportState {
    Due(AuthorityReportDue),
    Filed(AuthorityReportFiled),
    Attempting(AuthorityReportAttempting),
    ContingencyRequired(AuthorityReportFailed),
    ValidationFailed(AuthorityReportFailed),
    Unsupported(String),
}

tolerant_enum!(
    AuthorityReportState,
    variants: [Due, Filed, Attempting, ContingencyRequired, ValidationFailed, Unsupported],
    units: [],
    unknown: |kind| AuthorityReportState::Unsupported(kind),
);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthorityReportDue {
    pub urgent: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthorityReportFiled {
    pub portal_reference: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthorityReportAttempting {
    pub started_at: TimestampMillis,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthorityReportFailed {
    pub error: String,
    #[serde(default)]
    pub urgent: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MediaScanMatch {
    pub provider: MediaScanProvider,
    #[serde(serialize_with = "serialize_large_uint")]
    pub blob_id: u128,
    pub source: String,
    pub violations: Vec<String>,
    pub match_distance: i64,
    pub match_id: Option<String>,
    #[serde(default)]
    pub hash: Option<String>,
}

/// A provider this SDK doesn't know yet decodes as `Unsupported`, with its name
#[derive(Serialize, Clone, Debug)]
pub enum MediaScanProvider {
    PhotoDna,
    Unsupported(String),
}

tolerant_enum!(
    MediaScanProvider,
    variants: [Unsupported],
    units: [PhotoDna],
    unknown: |kind| MediaScanProvider::Unsupported(kind),
);

/// An offer to swap `token0_amount` of `token0` for `token1_amount` of `token1`
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct P2PSwapContent {
    pub swap_id: u32,
    pub token0: TokenInfo,
    #[serde(serialize_with = "serialize_large_uint")]
    pub token0_amount: u128,
    pub token1: TokenInfo,
    #[serde(serialize_with = "serialize_large_uint")]
    pub token1_amount: u128,
    pub expires_at: TimestampMillis,
    pub caption: Option<String>,
    pub token0_txn_in: u64,
    pub status: P2PSwapStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TokenInfo {
    pub symbol: String,
    pub ledger: CanisterId,
    pub decimals: u8,
    #[serde(serialize_with = "serialize_large_uint")]
    pub fee: u128,
}

/// A state this SDK doesn't know yet decodes as `Unsupported`, with its name
#[derive(Serialize, Clone, Debug)]
pub enum P2PSwapStatus {
    Open,
    Cancelled(P2PSwapCancelled),
    Expired(P2PSwapExpired),
    Reserved(P2PSwapReserved),
    Accepted(P2PSwapAccepted),
    Completed(P2PSwapCompleted),
    Unsupported(String),
}

tolerant_enum!(
    P2PSwapStatus,
    variants: [Cancelled, Expired, Reserved, Accepted, Completed, Unsupported],
    units: [Open],
    unknown: |kind| P2PSwapStatus::Unsupported(kind),
);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct P2PSwapCancelled {
    pub token0_txn_out: Option<u64>,
}

pub type P2PSwapExpired = P2PSwapCancelled;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct P2PSwapReserved {
    pub reserved_by: UserId,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct P2PSwapAccepted {
    pub accepted_by: UserId,
    pub token1_txn_in: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct P2PSwapCompleted {
    pub accepted_by: UserId,
    pub token1_txn_in: u64,
    pub token0_txn_out: u64,
    pub token1_txn_out: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VideoCallContent {
    pub call_type: VideoCallType,
    #[serde(default)]
    pub audio_only: bool,
    pub ended: Option<TimestampMillis>,
    pub participants: Vec<CallParticipant>,
    pub hidden_participants: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CallParticipant {
    pub user_id: UserId,
    pub joined: TimestampMillis,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EncryptedContent {
    pub content_type: EncryptedMessageContentType,
    pub version: u32,
    pub encrypted_message_key: EncryptionKey,
    pub public_key: EncryptionKey,
    pub encrypted_data: Vec<u8>,
}

/// A kind this SDK doesn't know yet decodes as `Unsupported`, with its name
#[derive(Serialize, Clone, Debug)]
pub enum EncryptedMessageContentType {
    Text,
    Image,
    Video,
    Audio,
    File,
    Crypto,
    Giphy,
    Custom(String),
    Unsupported(String),
}

tolerant_enum!(
    EncryptedMessageContentType,
    variants: [Custom, Unsupported],
    units: [Text, Image, Video, Audio, File, Crypto, Giphy],
    unknown: |kind| EncryptedMessageContentType::Unsupported(kind),
);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EncryptionKey(pub Vec<u8>);

/// An OpenGraph link preview. OpenChat stores whatever it is given here, it does not scrape
/// links itself, so it is up to the sender to populate these. The offchain SDK can do that
/// automatically - see `SendMessageBuilder::with_og_previews`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OgPreview {
    pub url: String,
    pub title: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<OgPreviewImage>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OgPreviewImage {
    pub url: String,
    pub width: u32,
    pub height: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::msgpack;
    use crate::types::{FailedCryptoTransaction, PendingCryptoTransaction, nns};

    // One value of each kind, as OpenChat sends them to bots: encoded with the backend's own types
    // and `msgpack::serialize_then_unwrap`, which writes large ints as strings (open-chat
    // 03fd05e7795)
    const BACKEND_CONTENTS: &[u8] = include_bytes!("test_data/backend_message_contents.msgpack");
    const BIG: u128 = 1_000_000_000_000_000_000_000;
    const NANOS: u64 = 1_760_000_000_123_456_789;

    #[test]
    fn decodes_every_kind_of_content_as_openchat_encodes_it() {
        let contents: Vec<MessageContent> = msgpack::deserialize_then_unwrap(BACKEND_CONTENTS);
        assert_eq!(contents.len(), 18);
        assert!(!format!("{contents:?}").contains("Unsupported"));

        let transfer = |i: usize| match &contents[i] {
            MessageContent::Crypto(c) => &c.transfer,
            other => panic!("Expected a transfer, got {other:?}"),
        };
        assert!(matches!(
            transfer(0),
            CryptoTransaction::Completed(CompletedCryptoTransaction::ICRC1(t))
                if t.amount == BIG && t.created == NANOS && t.block_index == u64::MAX
        ));
        assert!(matches!(
            transfer(1),
            CryptoTransaction::Completed(CompletedCryptoTransaction::NNS(t))
                if t.amount.e8s() == 123_456_789
                    && matches!(t.from, nns::CryptoAccount::Account(_))
                    && t.transaction_hash == [5; 32]
                    && t.memo == u64::MAX
        ));
        assert!(matches!(
            transfer(2),
            CryptoTransaction::Pending(PendingCryptoTransaction::Certified(t))
                if t.call.arg == [1, 2]
                    && t.call.nonce.as_deref() == Some(&[3][..])
                    && t.call.certificate == [4, 5]
        ));
        assert!(matches!(
            transfer(3),
            CryptoTransaction::Failed(FailedCryptoTransaction::ICRC2(t)) if t.error_message == "nope"
        ));

        assert!(matches!(
            &contents[4],
            MessageContent::GovernanceProposal(p) if matches!(
                &p.proposal,
                Proposal::SNS(p) if p.id == u64::MAX
                    && p.proposer == [6; 32]
                    && p.status == ProposalDecisionStatus::Executed
            )
        ));
        assert!(matches!(
            &contents[5],
            MessageContent::GovernanceProposal(p) if matches!(&p.proposal, Proposal::NNS(p) if p.topic == -1)
        ));
        assert!(matches!(
            &contents[6],
            MessageContent::Prize(p) if p.prizes_remaining == 3 && p.streak_only == 7 && p.min_chit_earned == 1000
        ));
        assert!(matches!(
            &contents[7],
            MessageContent::PrizeWinner(w) if w.prize_message == 42 && w.transaction.units() == Some(BIG)
        ));
        assert!(matches!(
            &contents[8],
            MessageContent::MessageReminderCreated(r) if r.reminder_id == u64::MAX && r.hidden
        ));
        assert!(matches!(&contents[9], MessageContent::MessageReminder(r) if r.notes.is_none()));
        assert!(matches!(
            &contents[10],
            MessageContent::ReportedMessage(r) if r.reports[0].reason_code == 2
        ));

        let MessageContent::ModerationReport(report) = &contents[11] else {
            panic!("Expected a moderation report, got {:?}", contents[11]);
        };
        assert!(matches!(report.chat_id, Chat::Channel(_, 7)));
        assert_eq!(report.blob_references[0].blob_id, BIG);
        assert_eq!(report.media_matches[0].match_distance, -3);
        assert!(matches!(
            report.status,
            ModerationReportStatus::UpheldAsCsam(_)
        ));
        assert!(matches!(
            &report.authority_report,
            Some(AuthorityReportState::ContingencyRequired(f)) if f.urgent
        ));

        assert!(matches!(
            &contents[12],
            MessageContent::P2PSwap(s) if s.token0_amount == BIG && matches!(s.status, P2PSwapStatus::Completed(_))
        ));
        assert!(matches!(
            &contents[13],
            MessageContent::P2PSwap(s) if matches!(s.status, P2PSwapStatus::Open)
        ));
        assert!(matches!(
            &contents[14],
            MessageContent::VideoCall(c) if c.audio_only && c.ended == Some(NANOS)
        ));
        assert!(matches!(
            &contents[15],
            MessageContent::Encrypted(e)
                if matches!(&e.content_type, EncryptedMessageContentType::Custom(kind) if kind == "thing")
                    && e.encrypted_message_key.0 == [1, 2]
                    && e.encrypted_data == [4, 5, 6]
        ));
        assert!(matches!(
            &contents[16],
            MessageContent::Encrypted(e) if matches!(e.content_type, EncryptedMessageContentType::Giphy)
        ));
        assert!(matches!(&contents[17], MessageContent::Custom(c) if c.data == [1, 2]));
    }

    #[test]
    fn a_price_chart_a_bot_sends_reads_back_as_one() {
        let ledger = CanisterId::from(Principal::from_slice(&[1; 10]));
        let chart = PriceChartContent {
            title: "CHAT and ADA · 30 days".to_string(),
            start: 1_000,
            end: 3_000,
            series: vec![
                PriceChartSeries {
                    token: PriceChartToken::Ledger(ledger),
                    symbol: "CHAT".to_string(),
                    name: "OpenChat".to_string(),
                    points: vec![(1_000, 0.5), (2_000, 0.25)],
                },
                PriceChartSeries {
                    token: PriceChartToken::Coin("cardano".to_string()),
                    symbol: "ADA".to_string(),
                    name: "Cardano".to_string(),
                    points: vec![(1_500, 0.75), (2_500, 1.0)],
                },
            ],
            sources: vec![PriceChartSource {
                name: "ICPSwap".to_string(),
                url: "https://www.icpswap.com".to_string(),
            }],
        };

        let bytes = msgpack::serialize_then_unwrap(MessageContentInitial::PriceChart(chart));
        let content: MessageContent = msgpack::deserialize_then_unwrap(&bytes);

        let MessageContent::PriceChart(chart) = &content else {
            panic!("Expected a price chart, got {content:?}");
        };
        assert!(matches!(chart.series[0].token, PriceChartToken::Ledger(l) if l == ledger));
        assert!(matches!(&chart.series[1].token, PriceChartToken::Coin(id) if id == "cardano"));
        assert_eq!(chart.series[0].points, [(1_000, 0.5), (2_000, 0.25)]);
        assert_eq!(chart.series[1].points, [(1_500, 0.75), (2_500, 1.0)]);
        assert_eq!(chart.sources[0].url, "https://www.icpswap.com");
        assert_eq!(content.text(), Some("CHAT and ADA · 30 days"));
    }

    fn mini_app_image() -> MiniAppImage {
        MiniAppImage {
            width: 640,
            height: 360,
            mime_type: "image/png".to_string(),
            blob_reference: BlobReference {
                canister_id: Principal::from_slice(&[1; 10]),
                blob_id: BIG,
            },
        }
    }

    #[test]
    fn a_mini_app_a_bot_sends_reads_back_as_one() {
        for image in [None, Some(mini_app_image())] {
            let mut card = MiniAppContent::new("**Tic-tac-toe** · tap Open to play");
            card.image = image.clone();

            let bytes = msgpack::serialize_then_unwrap(MessageContentInitial::MiniApp(card));
            let content: MessageContent = msgpack::deserialize_then_unwrap(&bytes);

            let MessageContent::MiniApp(card) = &content else {
                panic!("Expected a mini app, got {content:?}");
            };
            assert_eq!(card.text, "**Tic-tac-toe** · tap Open to play");
            assert_eq!(card.image, image);
            assert_eq!(content.text(), Some("**Tic-tac-toe** · tap Open to play"));
        }
    }

    fn user(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    use serde::de::IgnoredAny;
    use std::collections::BTreeMap;

    // As OpenChat's `types::MessageContent` encodes one, which is how bots receive it in events
    #[test]
    fn a_mini_app_decodes_as_openchat_encodes_it() {
        #[derive(Serialize)]
        struct OpenChatMiniApp {
            text: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            image: Option<MiniAppImage>,
            #[serde(skip_serializing_if = "Option::is_none")]
            max_players: Option<u32>,
            spectators: bool,
            spectator_count: u32,
            status: MiniAppStatus,
            players: Vec<UserId>,
            #[serde(skip_serializing_if = "Option::is_none")]
            waiting_for: Option<Vec<UserId>>,
            #[serde(skip_serializing_if = "Option::is_none")]
            result: Option<String>,
        }
        #[derive(Serialize)]
        enum OpenChatContent {
            MiniApp(OpenChatMiniApp),
        }

        let bytes = msgpack::serialize_then_unwrap(OpenChatContent::MiniApp(OpenChatMiniApp {
            text: "**Uno** · 2 to 4 players".to_string(),
            image: Some(mini_app_image()),
            max_players: Some(4),
            spectators: true,
            spectator_count: 3,
            status: MiniAppStatus::Finished,
            players: vec![user(1), user(2)],
            waiting_for: Some(vec![user(2)]),
            result: Some("Bob won".to_string()),
        }));
        let content: MessageContent = msgpack::deserialize_then_unwrap(&bytes);

        let MessageContent::MiniApp(card) = content else {
            panic!("Expected a mini app, got {content:?}");
        };
        assert_eq!(
            card,
            MiniAppContent {
                text: "**Uno** · 2 to 4 players".to_string(),
                image: Some(mini_app_image()),
                max_players: Some(4),
                spectators: true,
                spectator_count: 3,
                status: MiniAppStatus::Finished,
                players: vec![user(1), user(2)],
                waiting_for: Some(vec![user(2)]),
                result: Some("Bob won".to_string()),
            }
        );

        // With nothing optional set
        let bytes = msgpack::serialize_then_unwrap(OpenChatContent::MiniApp(OpenChatMiniApp {
            text: "x".to_string(),
            image: None,
            max_players: None,
            spectators: false,
            spectator_count: 0,
            status: MiniAppStatus::Open,
            players: Vec::new(),
            waiting_for: None,
            result: None,
        }));
        let content: MessageContent = msgpack::deserialize_then_unwrap(&bytes);
        assert!(matches!(content, MessageContent::MiniApp(c) if c == MiniAppContent::new("x")));
    }

    // OpenChat needs the status, players and whether others can watch, and takes a missing option
    // as none
    #[test]
    fn a_mini_app_is_sent_with_the_fields_openchat_needs() {
        let keys = |card: MiniAppContent| -> Vec<String> {
            let bytes = msgpack::serialize_then_unwrap(MessageContentInitial::MiniApp(card));
            let value: HashMap<String, BTreeMap<String, IgnoredAny>> =
                msgpack::deserialize_then_unwrap(&bytes);
            value["MiniApp"].keys().cloned().collect()
        };

        assert_eq!(
            keys(MiniAppContent::new("x")),
            ["players", "spectator_count", "spectators", "status", "text"]
        );
        assert_eq!(
            keys(
                MiniAppContent::new("x")
                    .with_image(mini_app_image())
                    .with_max_players(2)
                    .with_spectators(true)
                    .with_players(vec![user(1)])
            ),
            [
                "image",
                "max_players",
                "players",
                "spectator_count",
                "spectators",
                "status",
                "text"
            ]
        );
    }

    #[test]
    fn a_mini_app_is_valid_with_1_to_2000_characters() {
        assert_eq!(MiniAppContent::new("x").validate(), Ok(()));
        assert_eq!(
            MiniAppContent::new("é".repeat(MiniAppContent::MAX_TEXT_CHARS)).validate(),
            Ok(())
        );

        for text in [
            String::new(),
            " \n".to_string(),
            "x".repeat(MiniAppContent::MAX_TEXT_CHARS + 1),
        ] {
            assert!(MiniAppContent::new(text).validate().is_err());
        }
    }

    #[test]
    fn a_mini_app_image_needs_a_size_and_an_image_mime_type() {
        let card = |change: fn(&mut MiniAppImage)| {
            let mut image = mini_app_image();
            change(&mut image);
            MiniAppContent::new("x").with_image(image).validate()
        };

        assert_eq!(card(|_| ()), Ok(()));
        assert_eq!(card(|i| i.mime_type = "image/webp".to_string()), Ok(()));
        for change in [
            (|i: &mut MiniAppImage| i.width = 0) as fn(&mut MiniAppImage),
            |i| i.height = 0,
        ] {
            assert_eq!(
                card(change),
                Err("The image must have a width and a height".to_string())
            );
        }
        for mime_type in ["video/mp4", "application/octet-stream", ""] {
            let mut image = mini_app_image();
            image.mime_type = mime_type.to_string();
            assert_eq!(
                MiniAppContent::new("x").with_image(image).validate(),
                Err("The image's mime type must be an image's".to_string())
            );
        }
    }

    #[test]
    fn a_mini_app_s_players_are_checked_as_openchat_checks_them() {
        let card = || MiniAppContent::new("x").with_players(vec![user(1), user(2)]);
        let error = |card: MiniAppContent| card.validate().unwrap_err();

        assert_eq!(card().validate(), Ok(()));
        assert_eq!(card().with_max_players(2).validate(), Ok(()));
        assert_eq!(
            MiniAppContent::new("x")
                .with_players((0..100).map(user).collect())
                .validate(),
            Ok(())
        );

        for max in [0, 101] {
            assert_eq!(
                error(MiniAppContent::new("x").with_max_players(max)),
                "A game has 1 to 100 players at most"
            );
        }
        assert_eq!(
            error(card().with_max_players(1)),
            "This game has at most 1 players"
        );
        assert_eq!(
            error(MiniAppContent::new("x").with_players((0..=100).map(user).collect())),
            "This game has at most 100 players"
        );
        assert_eq!(
            error(MiniAppContent::new("x").with_players(vec![user(1), user(1)])),
            "A player is listed twice"
        );

        let mut waiting = card();
        waiting.waiting_for = Some(vec![user(3)]);
        assert_eq!(error(waiting), "Only players can be waited for");
    }

    #[test]
    fn only_a_mini_app_open_to_spectators_has_any() {
        let mut card = MiniAppContent::new("x");
        card.spectator_count = 2;
        assert_eq!(
            card.validate(),
            Err("Only a game open to spectators has any".to_string())
        );

        card.spectators = true;
        assert_eq!(card.validate(), Ok(()));

        card.apply(MiniAppUpdate::default().with_spectator_count(5));
        assert_eq!(card.spectator_count, 5);
        card.apply(MiniAppUpdate::default());
        assert_eq!(card.spectator_count, 5);
    }

    #[test]
    fn only_a_finished_mini_app_has_a_result_of_1_to_200_characters() {
        let with_result = |status, result: &str| {
            let mut card = MiniAppContent::new("x");
            card.status = status;
            card.result = Some(result.to_string());
            card.validate()
        };

        assert_eq!(with_result(MiniAppStatus::Finished, "Bob won"), Ok(()));
        assert_eq!(
            with_result(MiniAppStatus::Finished, &"x".repeat(200)),
            Ok(())
        );
        for status in [MiniAppStatus::Open, MiniAppStatus::Active] {
            assert_eq!(
                with_result(status, "Bob won"),
                Err("Only a finished game has a result".to_string())
            );
        }
        for result in [" ".to_string(), "x".repeat(201)] {
            assert_eq!(
                with_result(MiniAppStatus::Finished, &result),
                Err("The result must have 1 to 200 characters".to_string())
            );
        }
    }

    #[test]
    fn an_update_changes_only_what_it_sets() {
        let mut card = MiniAppContent::new("x").with_players(vec![user(1)]);
        card.waiting_for = Some(vec![user(1)]);

        card.apply(MiniAppUpdate::default());
        assert_eq!(card.players, [user(1)]);
        assert_eq!(card.waiting_for, Some(vec![user(1)]));

        card.apply(
            MiniAppUpdate::default()
                .with_players(vec![user(1), user(2)])
                .with_status(MiniAppStatus::Active)
                .with_waiting_for(Some(vec![user(2)])),
        );
        assert_eq!(card.status, MiniAppStatus::Active);
        assert_eq!(card.players, [user(1), user(2)]);
        assert_eq!(card.waiting_for, Some(vec![user(2)]));
        assert_eq!(card.validate(), Ok(()));

        card.apply(MiniAppUpdate::finished("Bob won"));
        assert_eq!(card.status, MiniAppStatus::Finished);
        assert_eq!(card.waiting_for, None);
        assert_eq!(card.result.as_deref(), Some("Bob won"));
        assert_eq!(card.players, [user(1), user(2)]);
        assert_eq!(card.validate(), Ok(()));
    }

    // As OpenChat's `MiniAppUpdate` reads it: what isn't set is left out, which it takes as no change
    #[test]
    fn an_update_is_sent_with_only_what_it_sets() {
        let value = |update: MiniAppUpdate| {
            let bytes = msgpack::serialize_then_unwrap(&update);
            let round_trip: MiniAppUpdate = msgpack::deserialize_then_unwrap(&bytes);
            assert_eq!(round_trip, update);
            msgpack::deserialize_then_unwrap::<serde_json::Value>(&bytes)
        };

        assert_eq!(value(MiniAppUpdate::default()), serde_json::json!({}));
        assert_eq!(
            value(MiniAppUpdate::finished("Bob won")),
            serde_json::json!({
                "status": "Finished",
                "waiting_for": "SetToNone",
                "result": { "SetToSome": "Bob won" },
            })
        );
        assert_eq!(
            value(MiniAppUpdate::default().with_spectator_count(3)),
            serde_json::json!({ "spectator_count": 3 })
        );

        // A user id is sent as its principal's bytes, which JSON can't hold
        let update = MiniAppUpdate::default().with_waiting_for(Some(vec![user(1)]));
        let bytes = msgpack::serialize_then_unwrap(&update);
        let sent: BTreeMap<String, BTreeMap<String, Vec<IgnoredAny>>> =
            msgpack::deserialize_then_unwrap(&bytes);
        assert_eq!(sent["waiting_for"]["SetToSome"].len(), 1);
        assert_eq!(
            msgpack::deserialize_then_unwrap::<MiniAppUpdate>(&bytes),
            update
        );
    }
}
