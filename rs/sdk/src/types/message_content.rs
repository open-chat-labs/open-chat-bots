use super::{
    CanisterId, Chat, CompletedCryptoTransaction, CryptoTransaction, MessageId, MessageIndex,
    Milliseconds, NnsNeuronId, ProposalId, SnsNeuronId, TimestampMillis, UserId, VideoCallType,
};
use crate::utils::{serialize_large_uint, serialize_principal_as_bytes, tolerant_enum};
use ic_principal::Principal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

/// A bot's card for a game, or another app, it hosts. OpenChat shows the text, with the players,
/// whose turn it is or the result, buttons to join, leave and open the game, and a frame box at the
/// app's aspect ratio. Opening the game shows the bot's app, served by the bot at `/app` under its
/// endpoint, in that frame. Whenever there's no app to show, before it loads, to someone who can't
/// open the game, and once the game is over without an end state, the box shows the app's image,
/// from the bot's definition.
///
/// Its text, app, player limit and whether others can watch are set when it's posted and never
/// change. Its status is written only by OpenChat's MiniApp service: the players the game starts
/// with, who joined through the service and whom the bot started it with when a player asked,
/// whose turn it is, and then its result. The bot tells the service how its game goes, and the
/// service updates the card.
///
/// A bot posts one through the MiniApp service, eg. with the offchain SDK's
/// `MiniAppServiceClient::post`, which posts it as the bot and records its game together, so
/// `send_message` refuses one. The bot must be installed in the chat, with
/// `MessagePermission::MiniApp`. A card can't be posted in a direct chat, nor forwarded or edited.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct MiniAppContent {
    /// Markdown, eg. "**Uno** · 2 to 4 players", of 1 to 2,000 characters. It's the message's text
    /// in notifications, previews and search.
    pub text: String,
    /// Which of the bot's apps the card opens, by its name in the bot's definition
    /// (`BotDefinition::mini_apps`), eg. "chess", of 1 to 50 characters. OpenChat refuses a card
    /// whose app isn't in the definition as OpenChat holds it, so after adding an app, update the
    /// bot's registration.
    pub app: String,
    /// The most who can play, 1 to 100, if there's a limit, so the card can show eg. "2 of 4"
    pub max_players: Option<u32>,
    /// Whether people who aren't playing can watch: members, and anyone who can see a public chat
    pub spectators: bool,
    /// The size the app's designed for, in CSS pixels, eg. 440 by 740. The card shows the app at
    /// that aspect ratio, sized before the app loads, so the chat doesn't jump as it does.
    pub app_size: MiniAppSize,
    /// Open when the bot posts it, after which only the MiniApp service changes it
    pub status: MiniAppStatus,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct MiniAppSize {
    pub width: u32,
    pub height: u32,
}

/// In the order a game goes through them, which it only ever moves forward through
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum MiniAppStatus {
    /// Taking players. Who's joined so far is shown live by the MiniApp service, not stored here.
    Open,
    /// Being played
    Active(MiniAppActive),
    /// Over, after which the card never changes
    Finished(MiniAppFinished),
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct MiniAppActive {
    /// Who the game started with, in the order they joined
    pub players: Vec<UserId>,
    /// The players whose turn it is, or no one in particular, eg. in a game without turns
    pub waiting_for: Vec<UserId>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct MiniAppFinished {
    /// Who the game started with, or no one if it never started
    pub players: Vec<UserId>,
    /// eg. "Bob won", or none if the game was abandoned
    pub result: Option<String>,
    /// How the game ended, as JSON the bot chose when it finished the game, eg. the final position
    /// and the moves, so viewers can step through them. OpenChat hands it to the bot's app, which
    /// the card keeps showing: `initialise_mini_app` with `finished: true`, then
    /// `{ kind: "mini_app_end_state", state }`. None if the bot gave none, when the card shows the
    /// app's image and the result instead.
    pub end_state: Option<String>,
}

impl MiniAppStatus {
    pub fn players(&self) -> &[UserId] {
        match self {
            MiniAppStatus::Open => &[],
            MiniAppStatus::Active(active) => &active.players,
            MiniAppStatus::Finished(finished) => &finished.players,
        }
    }

    pub fn result(&self) -> Option<&str> {
        match self {
            MiniAppStatus::Finished(finished) => finished.result.as_deref(),
            _ => None,
        }
    }
}

impl MiniAppContent {
    pub const MAX_TEXT_CHARS: usize = 2_000;
    pub const MAX_PLAYERS: usize = 100;
    /// The longest result the MiniApp service takes, to write to the card when the game finishes
    pub const MAX_RESULT_CHARS: usize = 200;
    /// An app's size is in pixels, no more than this each way, and no taller or wider than this
    /// ratio
    pub const MAX_APP_SIZE: u32 = 10_000;
    pub const MAX_APP_SIZE_RATIO: u32 = 3;
    /// The longest name of one of the bot's apps, as in its definition
    pub const MAX_APP_NAME_CHARS: usize = 50;
    /// The most an end state, as the bot's JSON serialized, can take up
    pub const MAX_END_STATE_BYTES: usize = 16 * 1024;

    /// An open card, with no limit on players, which only its players can open, for the bot's app
    /// named `app` in its definition. The app's size is what it's laid out for, in CSS pixels, so
    /// the card shows it at that aspect ratio, sized before it loads: each 1 to 10,000, and neither
    /// more than three times the other.
    pub fn new(
        app: impl Into<String>,
        text: impl Into<String>,
        app_width: u32,
        app_height: u32,
    ) -> Self {
        MiniAppContent {
            text: text.into(),
            app: app.into(),
            max_players: None,
            spectators: false,
            app_size: MiniAppSize {
                width: app_width,
                height: app_height,
            },
            status: MiniAppStatus::Open,
        }
    }

    /// The most who can play, 1 to 100
    pub fn with_max_players(mut self, max_players: u32) -> Self {
        self.max_players = Some(max_players);
        self
    }

    /// Whether people who aren't playing can watch
    pub fn with_spectators(mut self, spectators: bool) -> Self {
        self.spectators = spectators;
        self
    }

    /// Checks the card as OpenChat does when a bot posts it, so that a mistake shows up before it's
    /// sent. The errors are those OpenChat gives.
    pub fn validate(&self) -> Result<(), String> {
        if self.status != MiniAppStatus::Open {
            return Err("A game is posted open".to_string());
        }
        check_chars("text", &self.text, Self::MAX_TEXT_CHARS)?;
        check_chars("app", &self.app, Self::MAX_APP_NAME_CHARS)?;
        if self
            .max_players
            .is_some_and(|max| max == 0 || max as usize > Self::MAX_PLAYERS)
        {
            return Err(format!(
                "A game has 1 to {} players at most",
                Self::MAX_PLAYERS
            ));
        }
        {
            let size = self.app_size;
            if size.width == 0
                || size.height == 0
                || size.width > Self::MAX_APP_SIZE
                || size.height > Self::MAX_APP_SIZE
            {
                return Err(format!(
                    "The app's size is 1 to {} pixels each way",
                    Self::MAX_APP_SIZE
                ));
            }
            if size.width > size.height * Self::MAX_APP_SIZE_RATIO
                || size.height > size.width * Self::MAX_APP_SIZE_RATIO
            {
                return Err(format!(
                    "The app's size is at most {}:1 either way",
                    Self::MAX_APP_SIZE_RATIO
                ));
            }
        }
        // OpenChat's other checks are of the players, whose turn it is, the result and the end
        // state, which an open card has none of
        Ok(())
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

    fn user(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    // A card in each status, as the bot receives it in events
    fn mini_app_statuses() -> [MiniAppStatus; 4] {
        [
            MiniAppStatus::Open,
            MiniAppStatus::Active(MiniAppActive {
                players: vec![user(1), user(2)],
                waiting_for: vec![user(2)],
            }),
            MiniAppStatus::Finished(MiniAppFinished {
                players: vec![user(1), user(2)],
                result: Some("Bob won".to_string()),
                end_state: Some(r#"{"winner":"bob"}"#.to_string()),
            }),
            MiniAppStatus::Finished(MiniAppFinished {
                players: Vec::new(),
                result: None,
                end_state: None,
            }),
        ]
    }

    #[test]
    fn a_cards_app_size_is_within_reason() {
        for (width, height) in [(0, 500), (500, 0), (20_000, 500), (100, 400), (400, 100)] {
            assert!(
                MiniAppContent::new("uno", "Uno", width, height)
                    .validate()
                    .is_err(),
                "{width} by {height}"
            );
        }
        assert_eq!(
            MiniAppContent::new("uno", "Uno", 440, 740).validate(),
            Ok(())
        );
    }

    #[test]
    fn a_mini_app_reads_back_as_it_was_written() {
        for status in mini_app_statuses() {
            let mut card = MiniAppContent::new("uno", "**Uno** · 2 to 4 players", 440, 740)
                .with_max_players(4)
                .with_spectators(true);
            card.status = status;

            let bytes = msgpack::serialize_then_unwrap(MessageContent::MiniApp(card.clone()));
            let content: MessageContent = msgpack::deserialize_then_unwrap(&bytes);
            assert_eq!(content.text(), Some("**Uno** · 2 to 4 players"));
            assert!(matches!(&content, MessageContent::MiniApp(c) if *c == card));

            let bytes =
                msgpack::serialize_then_unwrap(MessageContentInitial::MiniApp(card.clone()));
            let content: MessageContentInitial = msgpack::deserialize_then_unwrap(&bytes);
            assert!(matches!(&content, MessageContentInitial::MiniApp(c) if *c == card));

            // In JSON too, where a user id is its text
            let json = serde_json::to_string(&card).unwrap();
            assert_eq!(serde_json::from_str::<MiniAppContent>(&json).unwrap(), card);
        }
    }

    // As OpenChat's `types::MessageContent` encodes one, which is how bots receive it in events: every
    // field, with a `None` as nil
    #[test]
    fn a_mini_app_decodes_as_openchat_encodes_it() {
        #[derive(Serialize)]
        struct OpenChatMiniApp {
            text: String,
            app: String,
            max_players: Option<u32>,
            spectators: bool,
            app_size: MiniAppSize,
            status: OpenChatStatus,
        }
        #[derive(Serialize)]
        enum OpenChatStatus {
            Open,
            Active {
                players: Vec<UserId>,
                waiting_for: Vec<UserId>,
            },
            Finished {
                players: Vec<UserId>,
                result: Option<String>,
                end_state: Option<String>,
            },
        }
        #[derive(Serialize)]
        enum OpenChatContent {
            MiniApp(OpenChatMiniApp),
        }

        let statuses = [
            OpenChatStatus::Open,
            OpenChatStatus::Active {
                players: vec![user(1), user(2)],
                waiting_for: vec![user(2)],
            },
            OpenChatStatus::Finished {
                players: vec![user(1), user(2)],
                result: Some("Bob won".to_string()),
                end_state: Some(r#"{"winner":"bob"}"#.to_string()),
            },
            OpenChatStatus::Finished {
                players: Vec::new(),
                result: None,
                end_state: None,
            },
        ];
        for (status, expected) in statuses.into_iter().zip(mini_app_statuses()) {
            let bytes = msgpack::serialize_then_unwrap(OpenChatContent::MiniApp(OpenChatMiniApp {
                text: "**Uno** · 2 to 4 players".to_string(),
                app: "uno".to_string(),
                max_players: Some(4),
                spectators: true,
                app_size: MiniAppSize {
                    width: 440,
                    height: 740,
                },
                status,
            }));
            let content: MessageContent = msgpack::deserialize_then_unwrap(&bytes);

            let MessageContent::MiniApp(card) = content else {
                panic!("Expected a mini app, got {content:?}");
            };
            assert_eq!(
                card,
                MiniAppContent {
                    text: "**Uno** · 2 to 4 players".to_string(),
                    app: "uno".to_string(),
                    max_players: Some(4),
                    spectators: true,
                    app_size: MiniAppSize {
                        width: 440,
                        height: 740
                    },
                    status: expected,
                }
            );
        }

        // With nothing optional set
        let bytes = msgpack::serialize_then_unwrap(OpenChatContent::MiniApp(OpenChatMiniApp {
            text: "x".to_string(),
            app: "uno".to_string(),
            max_players: None,
            spectators: false,
            app_size: MiniAppSize {
                width: 440,
                height: 740,
            },
            status: OpenChatStatus::Open,
        }));
        let content: MessageContent = msgpack::deserialize_then_unwrap(&bytes);
        assert!(matches!(
            content,
            MessageContent::MiniApp(c) if c == MiniAppContent::new("uno", "x", 440, 740)
        ));
    }

    // OpenChat needs every field but the player limit, and reads a nil as none
    #[test]
    fn a_mini_app_is_sent_with_every_field() {
        let bytes = msgpack::serialize_then_unwrap(MessageContentInitial::MiniApp(
            MiniAppContent::new("uno", "x", 440, 740).with_spectators(true),
        ));

        assert_eq!(
            msgpack::deserialize_then_unwrap::<serde_json::Value>(&bytes),
            serde_json::json!({
                "MiniApp": {
                    "text": "x",
                    "app": "uno",
                    "max_players": null,
                    "spectators": true,
                    "app_size": { "width": 440, "height": 740 },
                    "status": "Open",
                }
            })
        );
    }

    #[test]
    fn a_mini_app_s_status_gives_its_players_and_result() {
        let [open, active, finished, abandoned] = mini_app_statuses();

        assert!(open.players().is_empty());
        assert_eq!(active.players(), [user(1), user(2)]);
        assert_eq!(finished.players(), [user(1), user(2)]);
        assert_eq!(finished.result(), Some("Bob won"));
        for status in [open, active, abandoned] {
            assert_eq!(status.result(), None);
        }
    }

    #[test]
    fn a_mini_app_is_valid_with_1_to_2000_characters() {
        assert_eq!(MiniAppContent::new("uno", "x", 440, 740).validate(), Ok(()));
        assert_eq!(
            MiniAppContent::new("uno", "é".repeat(MiniAppContent::MAX_TEXT_CHARS), 440, 740)
                .validate(),
            Ok(())
        );

        for text in [
            String::new(),
            " \n".to_string(),
            "x".repeat(MiniAppContent::MAX_TEXT_CHARS + 1),
        ] {
            assert_eq!(
                MiniAppContent::new("uno", text, 440, 740).validate(),
                Err("The text must have 1 to 2000 characters".to_string())
            );
        }
    }

    // Which of the bot's apps it is: OpenChat checks the name's there, and that it's one of the
    // bot's, which only it can
    #[test]
    fn a_mini_app_names_an_app_in_1_to_50_characters() {
        assert_eq!(
            MiniAppContent::new(
                "é".repeat(MiniAppContent::MAX_APP_NAME_CHARS),
                "x",
                440,
                740
            )
            .validate(),
            Ok(())
        );

        for app in [
            String::new(),
            " \n".to_string(),
            "x".repeat(MiniAppContent::MAX_APP_NAME_CHARS + 1),
        ] {
            assert_eq!(
                MiniAppContent::new(app, "x", 440, 740).validate(),
                Err("The app must have 1 to 50 characters".to_string())
            );
        }
    }

    #[test]
    fn a_mini_app_has_1_to_100_players_at_most() {
        for max in [1, 100] {
            assert_eq!(
                MiniAppContent::new("uno", "x", 440, 740)
                    .with_max_players(max)
                    .validate(),
                Ok(())
            );
        }
        for max in [0, 101] {
            assert_eq!(
                MiniAppContent::new("uno", "x", 440, 740)
                    .with_max_players(max)
                    .validate(),
                Err("A game has 1 to 100 players at most".to_string())
            );
        }
    }

    // Only the MiniApp service writes a card's status
    #[test]
    fn a_mini_app_is_posted_open() {
        for status in mini_app_statuses().into_iter().skip(1) {
            let mut card = MiniAppContent::new("uno", "x", 440, 740);
            card.status = status;
            assert_eq!(card.validate(), Err("A game is posted open".to_string()));
        }
    }
}
