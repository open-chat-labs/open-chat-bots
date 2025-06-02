import type { AccessGateConfig } from "./access";
import type { ChatEvent } from "./event";
import type { GroupPermissions } from "./permissions";
import type { VersionedRules } from "./rules";
import type { VideoCall } from "./video";

export type SendMessageResponse = SendMessageSuccess | OCError;
export type CreateChannelResponse = CreateChannelSuccess | OCError;
export type DeleteChannelResponse = DeleteChannelSuccess | OCError;
export type ChatSummaryResponse = GroupChatSummary | DirectChatSummary | OCError;
export type ChatEventsResponse = ChatEventsSuccess | OCError;

export type ChatEventsSuccess = {
    kind: "success";
    events: ChatEventWrapper[];
    unauthorized: number[];
    expiredEventRanges: [number, number][];
    expiredMessageRanges: [number, number][];
    latestEventIndex: number;
    chatLastUpdated: bigint;
};

export type ChatEventWrapper = {
    index: number;
    timestamp: bigint;
    expiresAt?: bigint;
    event: ChatEvent;
};

export type GroupChatSummary = {
    kind: "group_chat";
    name: string;
    description: string;
    avatarId?: bigint;
    isPublic: boolean;
    historyVisibleToNewJoiners: boolean;
    messagesVisibleToNonMembers: boolean;
    permissions: GroupPermissions;
    rules: VersionedRules;
    eventsTtl?: bigint;
    eventsTtlLastUpdated?: bigint;
    gateConfig?: AccessGateConfig;
    videoCallInProgress?: VideoCall;
    verified: boolean;
    frozen?: FrozenGroupInfo;
    dateLastPinned?: bigint;
    lastUpdated: bigint;
    externalUrl?: string;
    latestEventIndex: number;
    latestMessageIndex?: number;
    memberCount: number;
};

export type DirectChatSummary = {
    kind: "direct_chat";
    eventsTtl?: bigint;
    eventsTtlLastUpdated?: bigint;
    videoCallInProgress?: VideoCall;
    lastUpdated: bigint;
    latestEventIndex: number;
    latestMessageIndex?: number;
};

export type FrozenGroupInfo = {
    timestamp: bigint;
    frozenBy: string;
    reason?: string;
};

export type DeleteChannelSuccess = {
    kind: "success";
};

export type CreateChannelSuccess = {
    kind: "success";
    channelId: bigint;
};

export type SendMessageSuccess = {
    kind: "success";
    messageId: bigint;
    eventIndex: number;
    messageIndex: number;
    timestamp: bigint;
    expiresAt?: bigint;
};

export type UnitResult = Success | OCError;

export type Success = { kind: "success" };

export type OCError = {
    kind: "error";
    code: number;
    message: string | undefined;
};

export enum OCErrorCode {
    Unknown = 0,

    // NotAuthorized
    InitiatorNotFound = 100,
    InitiatorNotAuthorized = 101,
    InitiatorSuspended = 102,
    InitiatorNotInChat = 103,
    InitiatorNotInCommunity = 104,
    InitiatorLapsed = 105,
    InitiatorBlocked = 106,

    // Invalid
    ChatNotFound = 200,
    MessageNotFound = 201,
    CommunityNotFound = 202,
    ThreadNotFound = 203,
    CanisterNotFound = 204,
    TargetUserNotFound = 205,
    SwapNotFound = 206,
    BotNotFound = 207,
    OwnerNotFound = 208,
    NewOwnerNotFound = 209,
    InvalidRequest = 210,
    InvalidReaction = 211,
    InvalidPrincipal = 212,
    InvalidAvatar = 213,
    InvalidEndpoint = 214,
    InvalidFlags = 215,
    InvalidTerm = 216,
    InvalidLanguage = 217,
    InvalidAccessGate = 218,
    NameTooShort = 219,
    NameTooLong = 220,
    TermTooShort = 221,
    TermTooLong = 222,
    DescriptionTooLong = 223,
    AlreadyRegistered = 224,
    PrincipalAlreadyUsed = 225,
    AlreadyAdded = 226,
    AlreadySet = 227,
    AlreadyAwarded = 228,
    AlreadyLifetimeDiamondMember = 229,
    AlreadyReported = 230,
    OwnerSuspended = 231,
    NewOwnerSuspended = 232,
    ChatFrozen = 233,
    CommunityFrozen = 234,
    InsufficientFunds = 235,
    PinRequired = 236,
    PinIncorrect = 237,
    TooManyFailedPinAttempts = 238,
    UserLimitReached = 239,
    CannotBlockSelf = 240,
    CannotBlockUser = 241,
    CommunityPublic = 242,
    CommunityNotPublic = 243,
    TargetUserNotInCommunity = 244,
    TargetUserNotInChat = 245,
    NotInitialized = 246,
    Expired = 247,
    DelegationTooOld = 248,
    MalformedSignature = 249,
    PriceMismatch = 250,
    NameTaken = 251,
    TooManyCommands = 252,
    NotDiamondMember = 253,
    UnexpectedIndex = 254,
    NoChange = 255,

    CyclesBalanceTooLow = 257,
    AlreadyInProgress = 258,
    InvalidPublicKey = 259,
    InvalidReferralCode = 260,
    ReferralCodeAlreadyClaimed = 261,
    ReferralCodeExpired = 262,
    UsernameTooShort = 263,
    UsernameTooLong = 264,
    InvalidUsername = 265,
    DisplayNameTooShort = 266,
    DisplayNameTooLong = 267,
    InvalidDisplayName = 268,
    NotInvited = 269,
    CurrencyNotSupported = 270,
    InvalidRoleChange = 271,
    CannotRemoveSelf = 272,
    CannotTipSelf = 273,
    NameReserved = 274,
    RulesTooShort = 275,
    RulesTooLong = 276,
    AvatarTooBig = 277,
    RecipientMismatch = 278,
    NewRegistrationsClosed = 279,
    LastOwnerCannotLeave = 280,
    TooManyInvites = 281,
    CommunityRulesNotAccepted = 282,
    ChatRulesNotAccepted = 283,
    InvalidExternalUrl = 284,
    VideoCallAlreadyEnded = 285,
    TargetUserBlocked = 286,
    MessageIdAlreadyExists = 287,
    ReplicaNotUpToDate = 288,
    InvalidMessageContent = 289,
    TransferCannotBeZero = 290,
    NoActiveStreak = 291,
    TextTooLong = 292,
    MessageHardDeleted = 293,
    InvalidMessageType = 294,
    ApiKeyNotFound = 295,
    TooManyUsers = 296,
    VideoCallNotFound = 297,
    PrizeNotFound = 298,
    PrizeEnded = 299,
    PrizeFullyClaimed = 300,
    PrizeAlreadyClaimed = 301,
    PrizeLedgerError = 302,
    InvalidName = 303,
    UserGroupNotFound = 304,
    ChatNotPublic = 305,
    PollNotFound = 306,
    PollEnded = 307,
    PollOptionNotFound = 308,
    CannotChangeVote = 309,
    AlreadyImportingIntoAnotherCommunity = 310,
    InvalidSignature = 311,
    TransferFailed = 312,
    GroupAlreadyBeingImported = 313,
    BannerTooBig = 314,
    CannotChangeRoleOfLastOwner = 315,
    CannotMakeBotOwner = 316,
    MessageAlreadyFinalized = 317,
    MaxGroupsCreated = 318,
    MaxCommunitiesCreated = 319,
    Throttled = 320,
    InvalidChannelName = 321,
    ApprovalFailed = 322,
    TransferCannotBeToSelf = 323,
    DateInThePast = 324,
    SwapFailed = 325,
    PinTooShort = 326,
    PinTooLong = 327,
    SwapStatusOpen = 328,
    SwapStatusCancelled = 329,
    SwapStatusExpired = 330,
    SwapStatusReserved = 331,
    SwapStatusAccepted = 332,
    SwapStatusCompleted = 333,
    NoEligibleNeurons = 334,
    ProposalNotFound = 335,
    ProposalNotAcceptingVotes = 336,
    IdentityLinkRequestNotFound = 337,
    InvalidBotActionScope = 338,
    WebhookNotFound = 339,
    InvalidWebhook = 340,
    InvalidOriginatingCanister = 341,

    // InternalError
    C2CError = 500,

    // Impossible (supposedly)
    Impossible = 600,
}
