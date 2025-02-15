export type SendMessageResponse = SendMessageSuccess | SendMessageFailure;
export type CreateChannelResponse = CreateChannelSuccess | CreateChannelFailure;
export type DeleteChannelResponse = DeleteChannelSuccess | DeleteChannelFailure;

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
    channelId: bigint;
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
export type Frozen = { kind: "frozen" };
export type ThreadNotFound = { kind: "thread_not_found" };
export type MessageAlreadyFinalized = { kind: "message_already_finalized" };
export type ServerError = { kind: "server_error" };
export type ChannelNotFound = { kind: "channel_not_found" };
