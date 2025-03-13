import type { AccessGateConfig } from "./access";
import type { ChatEvent } from "./event";
import type { GroupPermissions } from "./permissions";
import type { VersionedRules } from "./rules";
import type { VideoCall } from "./video";

export type SendMessageResponse = SendMessageSuccess | SendMessageFailure;
export type CreateChannelResponse = CreateChannelSuccess | CreateChannelFailure;
export type DeleteChannelResponse = DeleteChannelSuccess | DeleteChannelFailure;
export type ChatDetailsResponse = ChatDetailsSuccess | ChatDetailsFailure;
export type ChatEventsResponse = ChatEventsSuccess | ChatEventsFailure;

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

export type ChatEventsFailure = FailedAuthentication | NotAuthorized | NotFound | ServerError;

export type ChatDetailsSuccess = {
    kind: "success";
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

export type FrozenGroupInfo = {
    timestamp: bigint;
    frozenBy: string;
    reason?: string;
};

export type ChatDetailsFailure =
    | FailedAuthentication
    | DirectChatUnsupported
    | NotAuthorized
    | NotFound
    | ServerError;

export type DeleteChannelSuccess = {
    kind: "success";
};

export type DeleteChannelFailure =
    | ChannelNotFound
    | FailedAuthentication
    | InvalidRequest
    | NotAuthorized
    | Frozen
    | ServerError;

export type CreateChannelSuccess = {
    kind: "success";
    channelId: number;
};

export type CreateChannelFailure =
    | FailedAuthentication
    | InvalidRequest
    | NotAuthorized
    | Frozen
    | ServerError;

export type SendMessageFailure =
    | FailedAuthentication
    | InvalidRequest
    | NotAuthorized
    | Frozen
    | ThreadNotFound
    | MessageAlreadyFinalized
    | ServerError;

export type SendMessageSuccess = {
    kind: "success";
    messageId: bigint;
    eventIndex: number;
    messageIndex: number;
    timestamp: bigint;
    expiresAt?: bigint;
};
export type FailedAuthentication = { kind: "failed_authentication" };
export type InvalidRequest = { kind: "invalid_request" };
export type NotAuthorized = { kind: "not_authorized" };
export type DirectChatUnsupported = { kind: "direct_chat_unsupported" };
export type NotFound = { kind: "not_found" };
export type Frozen = { kind: "frozen" };
export type ThreadNotFound = { kind: "thread_not_found" };
export type MessageAlreadyFinalized = { kind: "message_already_finalized" };
export type ServerError = { kind: "server_error" };
export type ChannelNotFound = { kind: "channel_not_found" };
