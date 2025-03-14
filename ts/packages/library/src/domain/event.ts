import type { CommandArg } from "./bot";
import type { DataContent } from "./data";
import type { ChatIdentifier } from "./identifiers";
import type { GroupPermissions, PermissionRole } from "./permissions";
import type { VideoCallType } from "./video";

export type ChatEvent =
    | EmptyEvent
    | MessageEvent
    | GroupChatCreated
    | DirectChatCreated
    | GroupNameChanged
    | GroupDescChanged
    | GroupRulesChanged
    | AvatarChanged
    | MembersAdded
    | MembersRemoved
    | MemberJoined
    | MemberLeft
    | RoleChanged
    | UsersBlocked
    | UsersUnblocked
    | MessagePinned
    | MessageUnpinned
    | PermissionsChanged
    | GroupVisibilityChanged
    | GroupInviteCodeChanged
    | ChatFrozenEvent
    | ChatUnfrozenEvent
    | EventsTimeToLiveUpdated
    | GateUpdatedEvent
    | UsersInvitedEvent
    | MembersAddedToDefaultChannel
    | ExternalUrlUpdated
    | BotAdded
    | BotRemoved
    | BotUpdated;

export type EmptyEvent = {
    kind: "empty";
};

export type GroupChatCreated = {
    kind: "group_chat_created";
    name: string;
    description: string;
    created_by: string;
};

export type DirectChatCreated = {
    kind: "direct_chat_created";
};

export type GroupNameChanged = {
    kind: "name_changed";
    changedBy: string;
};

export type GroupDescChanged = {
    kind: "desc_changed";
    changedBy: string;
};

export type GroupRulesChanged = {
    kind: "rules_changed";
    enabled: boolean;
    enabledPrev: boolean;
    changedBy: string;
};

export type AvatarChanged = {
    kind: "avatar_changed";
    changedBy: string;
};

export type BotAdded = {
    kind: "bot_added";
    userId: string;
    addedBy: string;
};

export type BotRemoved = {
    kind: "bot_removed";
    userId: string;
    removedBy: string;
};

export type BotUpdated = {
    kind: "bot_updated";
    userId: string;
    updatedBy: string;
};

export type MembersAdded = {
    kind: "members_added";
    userIds: string[];
    addedBy: string;
};

export type AggregateCommonEvents = {
    kind: "aggregate_common_events";
    usersJoined: Set<string>;
    usersLeft: Set<string>;
    rolesChanged: Map<string, Map<PermissionRole, Set<string>>>;
    messagesDeleted: number[];
};

export type MemberJoined = {
    kind: "member_joined";
    userId: string;
};

export type MemberLeft = {
    kind: "member_left";
    userId: string;
};

export type MembersRemoved = {
    kind: "members_removed";
    userIds: string[];
    removedBy: string;
};

export type MessagePinned = {
    kind: "message_pinned";
    pinnedBy: string;
    messageIndex: number;
};

export type MessageUnpinned = {
    kind: "message_unpinned";
    unpinnedBy: string;
    messageIndex: number;
};

export type RoleChanged = {
    kind: "role_changed";
    userIds: string[];
    changedBy: string;
    oldRole: PermissionRole;
    newRole: PermissionRole;
};

export type UsersBlocked = {
    kind: "users_blocked";
    userIds: string[];
    blockedBy: string;
};

export type UsersUnblocked = {
    kind: "users_unblocked";
    userIds: string[];
    unblockedBy: string;
};

export type PermissionsChanged = {
    kind: "permissions_changed";
    oldPermissions: GroupPermissions;
    newPermissions: GroupPermissions;
    changedBy: string;
};

export type GroupVisibilityChanged = {
    kind: "group_visibility_changed";
    public?: boolean;
    messagesVisibleToNonMembers?: boolean;
    changedBy: string;
};

export type GroupInviteCodeChanged = {
    kind: "group_invite_code_changed";
    change: GroupInviteCodeChange;
    changedBy: string;
};

export type GroupInviteCodeChange = "enabled" | "disabled" | "reset";

export type ChatFrozenEvent = {
    kind: "chat_frozen";
    frozenBy: string;
    reason: string | undefined;
};

export type ChatUnfrozenEvent = {
    kind: "chat_unfrozen";
    unfrozenBy: string;
};

export type EventsTimeToLiveUpdated = {
    kind: "events_ttl_updated";
    updatedBy: string;
    newTimeToLive: bigint | undefined;
};

export type MembersAddedToDefaultChannel = {
    kind: "members_added_to_default_channel";
    count: number;
};

export type ExternalUrlUpdated = {
    kind: "external_url_updated";
    newUrl?: string;
    updatedBy: string;
};

export type GateUpdatedEvent = {
    kind: "gate_updated";
    updatedBy: string;
};

export type UsersInvitedEvent = {
    kind: "users_invited";
    userIds: string[];
    invitedBy: string;
};

export type MessageEvent<T extends MessageContent = MessageContent> = {
    kind: "message";
    messageId: bigint;
    messageIndex: number;
    sender: string;
    content: T;
    repliesTo?: ReplyContext;
    reactions: Reaction[];
    tips: TipsReceived;
    edited: boolean;
    forwarded: boolean;
    deleted: boolean;
    thread?: ThreadSummary;
    blockLevelMarkdown: boolean;
    botContext?: BotMessageContext;
};

type LedgerId = string;
type UserId = string;
export type TipsReceived = Record<LedgerId, Record<UserId, bigint>>;

export type BotContextCommand = {
    name: string;
    args: CommandArg[];
    initiator: string;
};

export type BotMessageContext = {
    command?: BotContextCommand;
    finalised: boolean;
};

export type ThreadSummary = {
    participantIds: Set<string>;
    followedByMe: boolean;
    numberOfReplies: number;
    latestEventIndex: number;
    latestEventTimestamp: bigint;
};

export type Reaction = {
    reaction: string;
    userIds: Set<string>;
};

export type ReplyContext = {
    kind: "reply_context";
    eventIndex: number;
    sourceContext?: MessageContext;
};

export type MessageContext = {
    chatId: ChatIdentifier;
    threadRootMessageIndex?: number;
};

export type MessageContent =
    | FileContent
    | TextContent
    | ImageContent
    | VideoContent
    | AudioContent
    | DeletedContent
    | BlockedContent
    | PlaceholderContent
    | BotPlaceholderContent
    | PollContent
    | CryptocurrencyContent
    | GiphyContent
    | ProposalContent
    | PrizeContent
    | PrizeContentInitial
    | P2PSwapContent
    | P2PSwapContentInitial
    | PrizeWinnerContent
    | MessageReminderCreatedContent
    | MessageReminderContent
    | ReportedMessageContent
    | UserReferralCard
    | MemeFighterContent
    | VideoCallContent;

export interface FileContent extends DataContent {
    kind: "file_content";
    name: string;
    caption?: string;
    mimeType: string;
    fileSize: number;
}

export interface TextContent {
    kind: "text_content";
    text: string;
}

export interface ImageContent extends DataContent {
    kind: "image_content";
    height: number;
    width: number;
    thumbnailData: string;
    caption?: string;
    mimeType: string;
}

export interface MemeFighterContent {
    kind: "meme_fighter_content";
    height: number;
    width: number;
    url: string;
}

export interface VideoContent {
    kind: "video_content";
    height: number;
    width: number;
    thumbnailData: string;
    caption?: string;
    mimeType: string;
    imageData: DataContent;
    videoData: DataContent;
}

export interface AudioContent extends DataContent {
    kind: "audio_content";
    caption?: string;
    mimeType: string;
}

export type DeletedContent = {
    kind: "deleted_content";
    deletedBy: string;
    timestamp: bigint;
};

export type BlockedContent = {
    kind: "blocked_content";
};

export type PollContent = {
    kind: "poll_content";
    votes: PollVotes;
    config: PollConfig;
    ended: boolean;
};

export type PollVotes = {
    total: TotalPollVotes;
    user: number[];
};

export type PollConfig = {
    allowMultipleVotesPerUser: boolean;
    allowUserToChangeVote: boolean;
    text?: string;
    showVotesBeforeEndDate: boolean;
    endDate?: bigint;
    anonymous: boolean;
    options: string[];
};

export type TotalPollVotes = AnonymousPollVotes | VisiblePollVotes | HiddenPollVotes;

export type AnonymousPollVotes = {
    kind: "anonymous_poll_votes";
    votes: Record<number, number>;
};

export type VisiblePollVotes = {
    kind: "visible_poll_votes";
    votes: Record<number, string[]>;
};

export type HiddenPollVotes = {
    kind: "hidden_poll_votes";
    votes: number;
};

export interface PlaceholderContent {
    kind: "placeholder_content";
}

export interface BotPlaceholderContent {
    kind: "bot_placeholder_content";
}

export type CompletedCryptocurrencyTransfer = {
    kind: "completed";
    ledger: string;
    recipient: string;
    sender: string;
    amountE8s: bigint;
    feeE8s: bigint;
    memo: bigint;
    blockIndex: bigint;
};

export type PendingCryptocurrencyTransfer = {
    kind: "pending";
    ledger: string;
    token: string;
    recipient: string;
    amountE8s: bigint;
    feeE8s?: bigint;
    memo?: bigint;
    createdAtNanos: bigint;
};

export type FailedCryptocurrencyTransfer = {
    kind: "failed";
    ledger: string;
    recipient: string;
    amountE8s: bigint;
    feeE8s: bigint;
    memo: bigint;
    errorMessage: string;
};

export type CryptocurrencyTransfer =
    | CompletedCryptocurrencyTransfer
    | PendingCryptocurrencyTransfer
    | FailedCryptocurrencyTransfer;

export interface CryptocurrencyContent {
    kind: "crypto_content";
    caption?: string;
    transfer: CryptocurrencyTransfer;
}

export type GiphyImage = {
    height: number;
    width: number;
    url: string;
    mimeType: string;
};

export interface GiphyContent {
    kind: "giphy_content";
    caption?: string;
    title: string;
    desktop: GiphyImage; //will be "original" from the giphy api
    mobile: GiphyImage; //will be "downsized_large" from the giphy api
}
export interface ProposalContent {
    kind: "proposal_content";
    governanceCanisterId: string;
    proposal: Proposal;
    myVote?: boolean;
}

export type Proposal = NnsProposal | SnsProposal;

export interface ProposalCommon {
    id: bigint;
    url: string;
    status: ProposalDecisionStatus;
    tally: Tally;
    title: string;
    created: number;
    deadline: number;
    lastUpdated: number;
    rewardStatus: ProposalRewardStatus;
    summary: string;
    proposer: string;
    payloadTextRendering?: string;
    minYesPercentageOfTotal: number;
    minYesPercentageOfExercised: number;
}

export interface Tally {
    yes: number;
    no: number;
    total: number;
    timestamp: bigint;
}

export interface NnsProposal extends ProposalCommon {
    kind: "nns";
    topic: NnsProposalTopic;
}

export enum NnsProposalTopic {
    Unspecified,
    NeuronManagement,
    ExchangeRate,
    NetworkEconomics,
    Governance,
    NodeAdmin,
    ParticipantManagement,
    SubnetManagement,
    NetworkCanisterManagement,
    KYC,
    NodeProviderRewards,
    SnsDecentralizationSale,
    SubnetReplicaVersionManagement,
    ReplicaVersionManagement,
    SnsAndCommunityFund,
}

export interface SnsProposal extends ProposalCommon {
    kind: "sns";
    action: number;
}

export enum ProposalDecisionStatus {
    Unspecified,
    Failed,
    Open,
    Rejected,
    Executed,
    Adopted,
}

export enum ProposalRewardStatus {
    Unspecified,
    AcceptVotes,
    ReadyToSettle,
    Settled,
}
export interface PrizeContent {
    kind: "prize_content";
    prizesRemaining: number;
    prizesPending: number;
    diamondOnly: boolean;
    lifetimeDiamondOnly: boolean;
    uniquePersonOnly: boolean;
    streakOnly: number;
    winners: string[];
    token: string;
    endDate: bigint;
    caption?: string;
}

export interface PrizeContentInitial {
    kind: "prize_content_initial";
    diamondOnly: boolean;
    lifetimeDiamondOnly: boolean;
    uniquePersonOnly: boolean;
    streakOnly: number;
    endDate: bigint;
    caption?: string;
    transfer: PendingCryptocurrencyTransfer;
    prizes: bigint[];
}
export interface P2PSwapContent {
    kind: "p2p_swap_content";
    token0: TokenInfo;
    token1: TokenInfo;
    token0Amount: bigint;
    token1Amount: bigint;
    caption?: string;
    expiresAt: bigint;
    status: P2PSwapStatus;
    swapId: number;
    token0TxnIn: TransactionId;
}

export type TransactionId = bigint;

export type P2PSwapStatus =
    | P2PSwapOpen
    | P2PSwapReserved
    | P2PSwapAccepted
    | P2PSwapCancelled
    | P2PSwapExpired
    | P2PSwapCompleted;

export interface P2PSwapOpen {
    kind: "p2p_swap_open";
}

export interface P2PSwapReserved {
    kind: "p2p_swap_reserved";
    reservedBy: string;
}

export interface P2PSwapAccepted {
    kind: "p2p_swap_accepted";
    acceptedBy: string;
    token1TxnIn: TransactionId;
}

export interface P2PSwapCancelled {
    kind: "p2p_swap_cancelled";
    token0TxnOut?: TransactionId;
}

export interface P2PSwapExpired {
    kind: "p2p_swap_expired";
    token0TxnOut?: TransactionId;
}

export interface P2PSwapCompleted {
    kind: "p2p_swap_completed";
    acceptedBy: string;
    token1TxnIn: TransactionId;
    token0TxnOut: TransactionId;
    token1TxnOut: TransactionId;
}

export interface P2PSwapContentInitial {
    kind: "p2p_swap_content_initial";
    token0: TokenInfo;
    token1: TokenInfo;
    token0Amount: bigint;
    token1Amount: bigint;
    caption?: string;
    expiresIn: bigint;
}

export interface TokenInfo {
    fee: bigint;
    decimals: number;
    symbol: string;
    ledger: string;
}

export interface PrizeWinnerContent {
    kind: "prize_winner_content";
    transaction: CompletedCryptocurrencyTransfer;
    prizeMessageIndex: number;
}

export type MessageReminderCreatedContent = {
    kind: "message_reminder_created_content";
    notes?: string;
    remindAt: number;
    reminderId: bigint;
    hidden: boolean;
};

export type MessageReminderContent = {
    kind: "message_reminder_content";
    notes?: string;
    reminderId: bigint;
};

export type ReportedMessageContent = {
    kind: "reported_message_content";
    total: number;
    reports: MessageReport[];
};

export type MessageReport = {
    notes?: string;
    reasonCode: number;
    timestamp: number;
    reportedBy: string;
};

export type UserReferralCard = {
    kind: "user_referral_card";
};

export type VideoCallParticipant = {
    userId: string;
    joined: bigint;
};

export type VideoCallContent = {
    kind: "video_call_content";
    participants: VideoCallParticipant[];
    ended?: bigint;
    callType: VideoCallType;
};

export type ChatEventsCriteria = ChatEventsPage | ChatEventsByIndex | ChatEventsWindow;

export type ChatEventsPage = {
    kind: "chat_events_page";
    startEventIndex: number;
    ascending: boolean;
    maxMessages: number;
    maxEvents: number;
};

export type ChatEventsByIndex = {
    kind: "chat_events_by_index";
    eventIndexes: number[];
};

export type ChatEventsWindow = {
    kind: "chat_events_window";
    midPointMessageIndex: number;
    maxMessages: number;
    maxEvents: number;
};
