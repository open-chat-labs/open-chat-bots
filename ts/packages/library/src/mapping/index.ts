import { Principal } from "@dfinity/principal";
import {
    type BlobReference,
    type AuthToken,
    type SendMessageResponse,
    type AccessGate,
    type AccessGateConfig,
    type GroupPermissions,
    type MessagePermissions,
    type PermissionRole,
    type CreateChannelResponse,
    type DeleteChannelResponse,
    DecodedApiKey,
    type RawApiKey,
    type ApiKeyActionScope,
    type MergedActionScope,
    type ChatIdentifier,
    type RawCommandJwt,
    type CommandActionScope,
    type RawApiKeyJwt,
    MergedActionChatScope,
    MergedActionCommunityScope,
    CommunityIdentifier,
    DecodedJwt,
    GroupChatIdentifier,
    DirectChatIdentifier,
    ChannelIdentifier,
    type ChatDetailsResponse,
    type ChatDetailsSuccess,
    type FrozenGroupInfo,
    type VideoCall,
    type LeafGate,
    type ChatEventWrapper,
    type ChatEvent,
    type GroupInviteCodeChange,
    type MessageEvent,
    type MessageContent,
    type FileContent,
    type AudioContent,
    type TextContent,
    type ImageContent,
    type VideoContent,
    type DeletedContent,
    type CryptocurrencyContent,
    type CryptocurrencyTransfer,
    type PendingCryptocurrencyTransfer,
    type CompletedCryptocurrencyTransfer,
    type FailedCryptocurrencyTransfer,
    ICP_SYMBOL,
    SNS1_SYMBOL,
    CKBTC_SYMBOL,
    CHAT_SYMBOL,
    KINIC_SYMBOL,
    type PollContent,
    type PollConfig,
    type PollVotes,
    type TotalPollVotes,
    type ReplyContext,
    type MessageContext,
    type GiphyContent,
    type GiphyImage,
    type ProposalContent,
    type Proposal,
    ProposalDecisionStatus,
    ProposalRewardStatus,
    type PrizeContent,
    type PrizeWinnerContent,
    type MessageReminderCreatedContent,
    type MessageReminderContent,
    type ReportedMessageContent,
    type P2PSwapContent,
    type TokenInfo,
    type P2PSwapStatus,
    type VideoCallContent,
    type VideoCallParticipant,
    type VideoCallType,
    type Reaction,
    type ThreadSummary,
    type TipsReceived,
    type BotMessageContext,
    type CommandArg,
    type ChatEventsResponse,
    type ChatEventsSuccess,
    type ChatEventsCriteria,
} from "../domain";
import {
    type AuthToken as ApiAuthToken,
    type BlobReference as ApiBlobReference,
    type AccessGate as ApiAccessGate,
    type AccessGateNonComposite as ApiAccessGateNonComposite,
    type AccessGateConfig as ApiAccessGateConfig,
    type MessagePermissions as ApiMessagePermissions,
    type GroupRole as ApiGroupRole,
    type GroupPermissionRole as ApiPermissionRole,
    type GroupPermissions as ApiGroupPermissions,
    type LocalUserIndexBotDeleteChannelResponse as BotDeleteChannelResponse,
    type LocalUserIndexBotSendMessageResponse as BotSendMessageResponse,
    type LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse,
    type Chat,
    type Chat as ApiChat,
    type LocalUserIndexBotChatDetailsResponse as BotChatDetailsResponse,
    type LocalUserIndexBotChatEventsResponse as BotChatEventsResponse,
    type ChatDetails,
    type FrozenGroupInfo as ApiFrozenGroupInfo,
    type VideoCall as ApiVideoCall,
    type ChatEvent as ApiChatEvent,
    type Message as ApiMessage,
    type MessageContent as ApiMessageContent,
    type FileContent as ApiFileContent,
    type AudioContent as ApiAudioContent,
    type TextContent as ApiTextContent,
    type VideoContent as ApiVideoContent,
    type ImageContent as ApiImageContent,
    type Cryptocurrency as ApiCryptocurrency,
    type PendingCryptoTransaction as ApiPendingCryptoTransaction,
    type FailedCryptoTransaction as ApiFailedCryptoTransaction,
    type CompletedCryptoTransaction as ApiCompletedCryptoTransaction,
    type CryptoTransaction as ApiCryptoTransaction,
    type CryptoContent as ApiCryptoContent,
    type DeletedBy as ApiDeletedBy,
    type PollContent as ApiPollContent,
    type PollConfig as ApiPollConfig,
    type PollVotes as ApiPollVotes,
    type TotalVotes as ApiTotalVotes,
    type ReplyContext as ApiReplyContext,
    type GiphyContent as ApiGiphyContent,
    type GiphyImageVariant as ApiGiphyImageVariant,
    type ProposalContent as ApiProposalContent,
    type Proposal as ApiProposal,
    type ProposalDecisionStatus as ApiProposalDecisionStatus,
    type ProposalRewardStatus as ApiProposalRewardStatus,
    type PrizeContent as ApiPrizeContent,
    type PrizeWinnerContent as ApiPrizeWinnerContent,
    type MessageReminderContent as ApiMessageReminderContent,
    type MessageReminderCreatedContent as ApiMessageReminderCreatedContent,
    type CustomContent as ApiCustomContent,
    type ReportedMessage as ApiReportedMessage,
    type P2PSwapContent as ApiP2PSwapContent,
    type TokenInfo as ApiTokenInfo,
    type P2PSwapStatus as ApiP2PSwapStatus,
    type VideoCallContent as ApiVideoCallContent,
    type CallParticipant as ApiCallParticipant,
    type VideoCallType as ApiVideoCallType,
    type ThreadSummary as ApiThreadSummary,
    type BotMessageContext as ApiBotMessageContext,
    BotCommandArg,
    type EventsResponse as ApiEventsResponse,
    type EventWrapperChatEvent as ApiEventWrapperChatEvent,
    type LocalUserIndexChatEventsEventsSelectionCriteria as ApiChatEventsCriteria,
} from "../typebox/typebox";
import { toBigInt32, toBigInt64 } from "../utils/bigint";
import { UnsupportedValueError } from "../utils/error";

const E8S_AS_BIGINT = BigInt(100_000_000);
type ApiPrincipal = Uint8Array | number[] | string;

function nullish<T>(val?: T | null | undefined): T | undefined {
    if (val == null) return undefined;
    return val;
}

export function mapApiKeyJwt(jwtStr: string, json: RawApiKeyJwt): DecodedJwt {
    return new DecodedJwt(
        jwtStr,
        json.bot_api_gateway,
        json.bot,
        mapApiKeyScope(json.scope),
        json.granted_permissions,
    );
}

export function mapCommandJwt(jwtStr: string, json: RawCommandJwt): DecodedJwt {
    return new DecodedJwt(
        jwtStr,
        json.bot_api_gateway,
        json.bot,
        mapCommandScope(json.scope),
        json.granted_permissions,
        json.command,
    );
}

export function mapApiKey(apiKey: string, json: RawApiKey): DecodedApiKey {
    return new DecodedApiKey(
        apiKey,
        json.gateway,
        json.bot_id,
        mapApiKeyScope(json.scope),
        json.permissions,
    );
}

export function mapCommandScope(api: CommandActionScope): MergedActionScope {
    if ("Chat" in api) {
        return new MergedActionChatScope(
            mapChatIdentifier(api.Chat.chat),
            api.Chat.thread,
            api.Chat.message_id ? toBigInt64(api.Chat.message_id) : undefined,
        );
    }
    if ("Community" in api) {
        return new MergedActionCommunityScope(
            new CommunityIdentifier(principalBytesToString(api.Community)),
        );
    }
    throw new Error(`Unexpected ApiKeyActionScope: ${api}`);
}

export function mapApiKeyScope(api: ApiKeyActionScope): MergedActionScope {
    if ("Chat" in api) {
        return new MergedActionChatScope(mapChatIdentifier(api.Chat));
    }
    if ("Community" in api) {
        return new MergedActionCommunityScope(
            new CommunityIdentifier(principalBytesToString(api.Community)),
        );
    }
    throw new Error(`Unexpected ApiKeyActionScope: ${api}`);
}

export function mapChatIdentifier(api: Chat): ChatIdentifier {
    if ("Group" in api) {
        return new GroupChatIdentifier(principalBytesToString(api.Group));
    }
    if ("Direct" in api) {
        return new DirectChatIdentifier(principalBytesToString(api.Direct));
    }
    if ("Channel" in api) {
        return new ChannelIdentifier(
            principalBytesToString(api.Channel[0]),
            Number(toBigInt32(api.Channel[1])),
        );
    }
    throw new Error(`Unexpected Chat type received: ${api}`);
}

export function sendMessageResponse(api: BotSendMessageResponse): SendMessageResponse {
    if (typeof api === "object") {
        if ("Success" in api) {
            return {
                kind: "success",
                messageId: toBigInt64(api.Success.message_id),
                eventIndex: api.Success.event_index,
                messageIndex: api.Success.message_index,
                timestamp: api.Success.timestamp,
                expiresAt: nullish(api.Success.expires_at),
            };
        }
        if ("FailedAuthentication" in api) {
            return { kind: "failed_authentication" };
        } else if ("InvalidRequest" in api) {
            return { kind: "invalid_request" };
        } else if ("C2CError" in api) {
            return { kind: "server_error" };
        }
    } else if (api === "Frozen") {
        return { kind: "frozen" };
    } else if (api === "MessageAlreadyFinalised") {
        return { kind: "message_already_finalized" };
    } else if (api === "NotAuthorized") {
        return { kind: "not_authorized" };
    } else if (api === "ThreadNotFound") {
        return { kind: "thread_not_found" };
    }
    throw new Error(`Unknown BotSendMessageResponseReceived: ${api}`);
}

export function createChannelResponse(api: BotCreateChannelResponse): CreateChannelResponse {
    if (typeof api === "object") {
        if ("Success" in api) {
            return {
                kind: "success",
                channelId: Number(toBigInt32(api.Success.channel_id)),
            };
        }
        if ("FailedAuthentication" in api) {
            return { kind: "failed_authentication" };
        } else if ("InvalidRequest" in api) {
            return { kind: "invalid_request" };
        } else if ("C2CError" in api) {
            return { kind: "server_error" };
        }
    } else if (api === "Frozen") {
        return { kind: "frozen" };
    } else if (api === "NotAuthorized") {
        return { kind: "not_authorized" };
    }
    throw new Error(`Unknown BotCreateChannelResponseReceived: ${api}`);
}

export function deleteChannelResponse(api: BotDeleteChannelResponse): DeleteChannelResponse {
    if (typeof api === "object") {
        if ("FailedAuthentication" in api) {
            return { kind: "failed_authentication" };
        } else if ("InvalidRequest" in api) {
            return { kind: "invalid_request" };
        } else if ("C2CError" in api) {
            return { kind: "server_error" };
        }
    } else if (api === "Success") {
        return { kind: "success" };
    } else if (api === "ChannelNotFound") {
        return { kind: "channel_not_found" };
    } else if (api === "Frozen") {
        return { kind: "frozen" };
    } else if (api === "NotAuthorized") {
        return { kind: "not_authorized" };
    }
    throw new Error(`Unknown BotDeleteChannelResponseReceived: ${api}`);
}

export function chatDetailsResponse(api: BotChatDetailsResponse): ChatDetailsResponse {
    if (typeof api === "object") {
        if ("Success" in api) {
            return chatDetails(api.Success);
        } else if ("FailedAuthentication" in api) {
            return { kind: "failed_authentication" };
        } else if ("InternalError" in api) {
            return { kind: "server_error" };
        }
    } else if (api === "DirectChatUnsupported") {
        return { kind: "direct_chat_unsupported" };
    } else if (api === "NotAuthorized") {
        return { kind: "not_authorized" };
    } else if (api === "NotFound") {
        return { kind: "not_found" };
    }
    throw new Error(`Unknown BotChatDetailsResponse: ${api}`);
}

export function chatEventsResponse(api: BotChatEventsResponse): ChatEventsResponse {
    if (typeof api === "object") {
        if ("Success" in api) {
            return chatEventsSuccessResponse(api.Success);
        } else if ("FailedAuthentication" in api) {
            return { kind: "failed_authentication" };
        } else if ("InternalError" in api) {
            return { kind: "server_error" };
        }
    } else if (api === "NotAuthorized") {
        return { kind: "not_authorized" };
    } else if (api === "NotFound") {
        return { kind: "not_found" };
    }
    throw new UnsupportedValueError("Unknown BotChatEventsResponse", api);
}

function chatEventsSuccessResponse(api: ApiEventsResponse): ChatEventsSuccess {
    return {
        kind: "success",
        events: api.events.map(eventWrapper),
        unauthorized: api.unauthorized,
        expiredEventRanges: api.expired_event_ranges,
        expiredMessageRanges: api.expired_message_ranges,
        latestEventIndex: api.latest_event_index,
        chatLastUpdated: api.chat_last_updated,
    };
}

function chatDetails(api: ChatDetails): ChatDetailsSuccess {
    return {
        kind: "success",
        name: api.name,
        description: api.description,
        avatarId: api.avatar_id,
        isPublic: api.is_public,
        historyVisibleToNewJoiners: api.history_visible_to_new_joiners,
        messagesVisibleToNonMembers: api.messages_visible_to_non_members,
        permissions: groupPermissions(api.permissions),
        rules: api.rules,
        eventsTtl: api.events_ttl,
        eventsTtlLastUpdated: api.events_ttl_last_updated,
        gateConfig: optional(api.gate_config, accessGateConfig),
        videoCallInProgress: optional(api.video_call_in_progress, videoCall),
        verified: api.verified ?? false,
        frozen: optional(api.frozen, frozenGroupInfo),
        dateLastPinned: api.date_last_pinned,
        lastUpdated: api.last_updated,
        externalUrl: api.external_url,
        latestEventIndex: api.latest_event_index,
        latestMessageIndex: api.latest_message_index,
        memberCount: api.member_count,
    };
}

function groupPermissions(api: ApiGroupPermissions): GroupPermissions {
    return {
        changeRoles: permissionRole(api.change_roles),
        updateGroup: permissionRole(api.update_group),
        addMembers: permissionRole(api.add_members),
        inviteUsers: permissionRole(api.invite_users),
        removeMembers: permissionRole(api.remove_members),
        deleteMessages: permissionRole(api.delete_messages),
        pinMessages: permissionRole(api.pin_messages),
        reactToMessages: permissionRole(api.react_to_messages),
        mentionAllMembers: permissionRole(api.mention_all_members),
        startVideoCall: permissionRole(api.start_video_call),
        messagePermissions: messagePermissions(api.message_permissions),
        threadPermissions: optional(api.thread_permissions, messagePermissions),
    };
}

function messagePermissions(api: ApiMessagePermissions): MessagePermissions {
    return {
        audio: optional(api.audio, permissionRole) ?? "none",
        video: optional(api.video, permissionRole) ?? "none",
        videoCall: optional(api.video_call, permissionRole) ?? "none",
        custom: api.custom.map((p) => ({
            subtype: p.subtype,
            role: permissionRole(p.role),
        })),
        file: optional(api.file, permissionRole) ?? "none",
        poll: optional(api.poll, permissionRole) ?? "none",
        text: optional(api.text, permissionRole) ?? "none",
        crypto: optional(api.crypto, permissionRole) ?? "none",
        giphy: optional(api.giphy, permissionRole) ?? "none",
        default: optional(api.default, permissionRole) ?? "none",
        image: optional(api.image, permissionRole) ?? "none",
        prize: optional(api.prize, permissionRole) ?? "none",
        p2pSwap: optional(api.p2p_swap, permissionRole) ?? "none",
    };
}

function frozenGroupInfo(api: ApiFrozenGroupInfo): FrozenGroupInfo {
    return {
        timestamp: api.timestamp,
        frozenBy: principalBytesToString(api.frozen_by),
        reason: api.reason,
    };
}

function accessGateConfig(api: ApiAccessGateConfig): AccessGateConfig {
    return {
        gate: accessGate(api.gate),
        expiry: api.expiry,
    };
}

export function accessGate(api: ApiAccessGate): AccessGate {
    if (api === "DiamondMember") {
        return {
            kind: "diamond_gate",
        };
    } else if (api === "LifetimeDiamondMember") {
        return {
            kind: "lifetime_diamond_gate",
        };
    } else if (api === "UniquePerson") {
        return {
            kind: "unique_person_gate",
        };
    } else if (api === "Locked") {
        return {
            kind: "locked_gate",
        };
    } else if (api === "ReferredByMember") {
        return {
            kind: "referred_by_member_gate",
        };
    } else if ("Composite" in api) {
        return {
            kind: "composite_gate",
            operator: api.Composite.and ? "and" : "or",
            gates: api.Composite.inner.map(accessGate) as LeafGate[],
        };
    } else if ("SnsNeuron" in api) {
        return {
            kind: "neuron_gate",
            minDissolveDelay: optional(api.SnsNeuron.min_dissolve_delay, BigInt),
            minStakeE8s: optional(api.SnsNeuron.min_stake_e8s, BigInt),
            governanceCanister: principalBytesToString(api.SnsNeuron.governance_canister_id),
        };
    } else if ("VerifiedCredential" in api) {
        const credentialArgs = Object.entries(api.VerifiedCredential.credential_arguments);
        return {
            kind: "credential_gate",
            credential: {
                issuerCanisterId: principalBytesToString(api.VerifiedCredential.issuer_canister_id),
                issuerOrigin: api.VerifiedCredential.issuer_origin,
                credentialType: api.VerifiedCredential.credential_type,
                credentialName: api.VerifiedCredential.credential_name,
                credentialArguments:
                    credentialArgs.length === 0 ? undefined : credentialArguments(credentialArgs),
            },
        };
    } else if ("Payment" in api) {
        return {
            kind: "payment_gate",
            ledgerCanister: principalBytesToString(api.Payment.ledger_canister_id),
            amount: api.Payment.amount,
            fee: api.Payment.fee,
        };
    } else if ("TokenBalance" in api) {
        return {
            kind: "token_balance_gate",
            ledgerCanister: principalBytesToString(api.TokenBalance.ledger_canister_id),
            minBalance: api.TokenBalance.min_balance,
        };
    }

    throw new Error(`Unexpected ApiGroupGate type received: ${api}`);
}

export function credentialArguments(
    value: [string, { String: string } | { Int: number }][],
): Record<string, string | number> {
    return toRecord2(
        value,
        ([k, _]) => k,
        ([_, v]) => {
            if ("String" in v) {
                return v.String;
            } else {
                return v.Int;
            }
        },
    );
}

function videoCall(api: ApiVideoCall): VideoCall {
    return {
        messageIndex: api.message_index,
        callType: api.call_type === "Default" ? "default" : "broadcast",
    };
}

export function apiAuthToken(auth: AuthToken): ApiAuthToken {
    switch (auth.kind) {
        case "api_key":
            return {
                ApiKey: auth.token,
            };
        default:
            return {
                Jwt: auth.token,
            };
    }
}

export function apiBlobReference(domain: BlobReference): ApiBlobReference {
    return {
        blob_id: domain.blobId,
        canister_id: principalStringToBytes(domain.canisterId),
    };
}

export function apiAccessGateConfig(domain: AccessGateConfig): ApiAccessGateConfig {
    return {
        gate: apiAccessGate(domain.gate),
        expiry: apiOptional(domain.expiry, identity),
    };
}

export function apiAccessGate(domain: AccessGate): ApiAccessGate {
    if (domain.kind === "composite_gate") {
        return {
            Composite: {
                and: domain.operator === "and",
                inner: domain.gates.map(apiLeafAccessGate),
            },
        };
    }
    return apiLeafAccessGate(domain);
}

export function apiLeafAccessGate(domain: AccessGate): ApiAccessGateNonComposite {
    switch (domain.kind) {
        case "neuron_gate":
            return {
                SnsNeuron: {
                    governance_canister_id: principalStringToBytes(domain.governanceCanister),
                    min_stake_e8s: apiOptional(domain.minStakeE8s, BigInt),
                    min_dissolve_delay: apiOptional(domain.minDissolveDelay, BigInt),
                },
            };
        case "payment_gate":
            return {
                Payment: {
                    ledger_canister_id: principalStringToBytes(domain.ledgerCanister),
                    amount: domain.amount,
                    fee: domain.fee,
                },
            };
        case "diamond_gate":
            return "DiamondMember";
        case "lifetime_diamond_gate":
            return "LifetimeDiamondMember";
        case "unique_person_gate":
            return "UniquePerson";
        case "credential_gate":
            return {
                VerifiedCredential: {
                    credential_name: domain.credential.credentialName,
                    issuer_canister_id: principalStringToBytes(domain.credential.issuerCanisterId),
                    issuer_origin: domain.credential.issuerOrigin,
                    credential_type: domain.credential.credentialType,
                    credential_arguments: apiCredentialArguments(
                        domain.credential.credentialArguments,
                    ),
                },
            };
        case "token_balance_gate":
            return {
                TokenBalance: {
                    ledger_canister_id: principalStringToBytes(domain.ledgerCanister),
                    min_balance: domain.minBalance,
                },
            };
        case "locked_gate":
            return "Locked";
        case "referred_by_member_gate":
            return "ReferredByMember";

        default:
            throw new Error(`Received a domain level group gate that we cannot parse: ${domain}`);
    }
}

type ApiCredentialArguments = Record<string, { String: string } | { Int: number }>;
function apiCredentialArguments(domain?: Record<string, string | number>): ApiCredentialArguments {
    return Object.entries(domain ?? {}).reduce((res, [k, v]) => {
        res[k] = typeof v === "number" ? { Int: v } : { String: v };
        return res;
    }, {} as ApiCredentialArguments);
}

export function permissionRole(api: ApiPermissionRole | ApiGroupRole): PermissionRole {
    switch (api) {
        case "Admin":
            return "admin";
        case "Admins":
            return "admin";
        case "Members":
            return "member";
        case "Participant":
            return "member";
        case "Moderators":
            return "moderator";
        case "Moderator":
            return "moderator";
        case "None":
            return "none";
        case "Owner":
            return "owner";
    }
}

export function apiPermissionRole(domain: PermissionRole): ApiPermissionRole {
    switch (domain) {
        case "admin":
            return "Admins";
        case "member":
            return "Members";
        case "moderator":
            return "Moderators";
        case "none":
            return "None";
        case "owner":
            return "Owner";
    }
}

export function apiMessagePermissions(domain: MessagePermissions): ApiMessagePermissions {
    return {
        audio: apiOptional(domain.audio, apiPermissionRole),
        video: apiOptional(domain.video, apiPermissionRole),
        video_call: apiOptional(domain.videoCall, apiPermissionRole),
        custom: domain.custom.map((p) => ({
            subtype: p.subtype,
            role: apiPermissionRole(p.role),
        })),
        file: apiOptional(domain.file, apiPermissionRole),
        poll: apiOptional(domain.poll, apiPermissionRole),
        text: apiOptional(domain.text, apiPermissionRole),
        crypto: apiOptional(domain.crypto, apiPermissionRole),
        giphy: apiOptional(domain.giphy, apiPermissionRole),
        default: apiPermissionRole(domain.default),
        image: apiOptional(domain.image, apiPermissionRole),
        prize: apiOptional(domain.prize, apiPermissionRole),
        p2p_swap: apiOptional(domain.p2pSwap, apiPermissionRole),
    };
}

export function apiGroupPermissions(domain: GroupPermissions): ApiGroupPermissions {
    return {
        mention_all_members: apiPermissionRole(domain.mentionAllMembers),
        delete_messages: apiPermissionRole(domain.deleteMessages),
        remove_members: apiPermissionRole(domain.removeMembers),
        update_group: apiPermissionRole(domain.updateGroup),
        message_permissions: apiMessagePermissions(domain.messagePermissions),
        invite_users: apiPermissionRole(domain.inviteUsers),
        thread_permissions: apiOptional(domain.threadPermissions, apiMessagePermissions),
        change_roles: apiPermissionRole(domain.changeRoles),
        start_video_call: apiPermissionRole(domain.startVideoCall),
        add_members: apiPermissionRole(domain.addMembers),
        pin_messages: apiPermissionRole(domain.pinMessages),
        react_to_messages: apiPermissionRole(domain.reactToMessages),
    };
}

// export function apiOptionUpdate<A, B>(
//     mapper: (a: A) => B,
//     domain: OptionUpdate<A>,
// ): ApiOptionUpdateV2<B> {
//     if (domain === undefined) return "NoChange";
//     if (domain === "set_to_none") return "SetToNone";
//     return { SetToSome: mapper(domain.value) };
// }

export function apiOptional<A, B>(domain: A | undefined, mapper: (a: A) => B): B | undefined {
    return domain === undefined ? undefined : mapper(domain);
}

export function optional<A, B>(api: A | null | undefined, mapper: (a: A) => B): B | undefined {
    return api != null ? mapper(api) : undefined;
}

export function identity<A>(a: A): A {
    return a;
}

export function principalStringToBytes(principal: string): Uint8Array {
    return Principal.fromText(principal).toUint8Array();
}

export function consolidateBytes(bytes: Uint8Array | number[]): Uint8Array {
    return Array.isArray(bytes) ? new Uint8Array(bytes) : bytes;
}

export function principalBytesToString(value: Uint8Array | number[] | string): string {
    // When serialized to JSON principals become strings, in all other cases they are serialized as byte arrays
    if (typeof value === "string") {
        return value;
    }
    return Principal.fromUint8Array(consolidateBytes(value)).toString();
}

export function toRecord2<T, K extends string | number | symbol, V>(
    xs: T[],
    keyFn: (x: T) => K,
    valFn: (x: T) => V,
): Record<K, V> {
    return xs.reduce(
        (rec, x) => {
            rec[keyFn(x)] = valFn(x);
            return rec;
        },
        {} as Record<K, V>,
    );
}

export function eventWrapper(value: ApiEventWrapperChatEvent): ChatEventWrapper {
    return {
        event: event(value.event),
        index: value.index,
        timestamp: value.timestamp,
        expiresAt: optional(value.expires_at, BigInt),
    };
}

export function event(value: ApiChatEvent): ChatEvent {
    if (value === "Empty" || value === "FailedToDeserialize") {
        return { kind: "empty" };
    }
    if ("Message" in value) {
        return message(value.Message);
    }
    if ("GroupChatCreated" in value) {
        return {
            kind: "group_chat_created",
            name: value.GroupChatCreated.name,
            description: value.GroupChatCreated.description,
            created_by: principalBytesToString(value.GroupChatCreated.created_by),
        };
    }
    if ("DirectChatCreated" in value) {
        return {
            kind: "direct_chat_created",
        };
    }
    if ("ParticipantsAdded" in value) {
        return {
            kind: "members_added",
            userIds: value.ParticipantsAdded.user_ids.map(principalBytesToString),
            addedBy: principalBytesToString(value.ParticipantsAdded.added_by),
        };
    }
    if ("UsersInvited" in value) {
        return {
            kind: "users_invited",
            userIds: value.UsersInvited.user_ids.map(principalBytesToString),
            invitedBy: principalBytesToString(value.UsersInvited.invited_by),
        };
    }
    if ("ParticipantJoined" in value) {
        return {
            kind: "member_joined",
            userId: principalBytesToString(value.ParticipantJoined.user_id),
        };
    }
    if ("ParticipantsRemoved" in value) {
        return {
            kind: "members_removed",
            userIds: value.ParticipantsRemoved.user_ids.map(principalBytesToString),
            removedBy: principalBytesToString(value.ParticipantsRemoved.removed_by),
        };
    }
    if ("ParticipantLeft" in value) {
        return {
            kind: "member_left",
            userId: principalBytesToString(value.ParticipantLeft.user_id),
        };
    }
    if ("GroupNameChanged" in value) {
        return {
            kind: "name_changed",
            changedBy: principalBytesToString(value.GroupNameChanged.changed_by),
        };
    }
    if ("GroupDescriptionChanged" in value) {
        return {
            kind: "desc_changed",
            changedBy: principalBytesToString(value.GroupDescriptionChanged.changed_by),
        };
    }
    if ("GroupRulesChanged" in value) {
        return {
            kind: "rules_changed",
            enabled: value.GroupRulesChanged.enabled,
            enabledPrev: value.GroupRulesChanged.prev_enabled,
            changedBy: principalBytesToString(value.GroupRulesChanged.changed_by),
        };
    }
    if ("AvatarChanged" in value) {
        return {
            kind: "avatar_changed",
            changedBy: principalBytesToString(value.AvatarChanged.changed_by),
        };
    }
    if ("UsersBlocked" in value) {
        return {
            kind: "users_blocked",
            userIds: value.UsersBlocked.user_ids.map(principalBytesToString),
            blockedBy: principalBytesToString(value.UsersBlocked.blocked_by),
        };
    }
    if ("UsersUnblocked" in value) {
        return {
            kind: "users_unblocked",
            userIds: value.UsersUnblocked.user_ids.map(principalBytesToString),
            unblockedBy: principalBytesToString(value.UsersUnblocked.unblocked_by),
        };
    }
    if ("RoleChanged" in value) {
        return {
            kind: "role_changed",
            userIds: value.RoleChanged.user_ids.map(principalBytesToString),
            changedBy: principalBytesToString(value.RoleChanged.changed_by),
            oldRole: permissionRole(value.RoleChanged.old_role),
            newRole: permissionRole(value.RoleChanged.new_role),
        };
    }
    if ("MessagePinned" in value) {
        return {
            kind: "message_pinned",
            pinnedBy: principalBytesToString(value.MessagePinned.pinned_by),
            messageIndex: value.MessagePinned.message_index,
        };
    }
    if ("MessageUnpinned" in value) {
        return {
            kind: "message_unpinned",
            unpinnedBy: principalBytesToString(value.MessageUnpinned.unpinned_by),
            messageIndex: value.MessageUnpinned.message_index,
        };
    }

    if ("PermissionsChanged" in value) {
        return {
            kind: "permissions_changed",
            oldPermissions: groupPermissions(value.PermissionsChanged.old_permissions_v2),
            newPermissions: groupPermissions(value.PermissionsChanged.new_permissions_v2),
            changedBy: principalBytesToString(value.PermissionsChanged.changed_by),
        };
    }
    if ("GroupVisibilityChanged" in value) {
        return {
            kind: "group_visibility_changed",
            public: optional(value.GroupVisibilityChanged.public, identity),
            messagesVisibleToNonMembers: optional(
                value.GroupVisibilityChanged.messages_visible_to_non_members,
                identity,
            ),
            changedBy: principalBytesToString(value.GroupVisibilityChanged.changed_by),
        };
    }
    if ("GroupInviteCodeChanged" in value) {
        let change: GroupInviteCodeChange = "disabled";
        if (value.GroupInviteCodeChanged.change === "Enabled") {
            change = "enabled";
        } else if (value.GroupInviteCodeChanged.change === "Reset") {
            change = "reset";
        }

        return {
            kind: "group_invite_code_changed",
            change,
            changedBy: principalBytesToString(value.GroupInviteCodeChanged.changed_by),
        };
    }
    if ("ChatFrozen" in value) {
        return {
            kind: "chat_frozen",
            frozenBy: principalBytesToString(value.ChatFrozen.frozen_by),
            reason: optional(value.ChatFrozen.reason, identity),
        };
    }
    if ("ChatUnfrozen" in value) {
        return {
            kind: "chat_unfrozen",
            unfrozenBy: principalBytesToString(value.ChatUnfrozen.unfrozen_by),
        };
    }
    if ("EventsTimeToLiveUpdated" in value) {
        return {
            kind: "events_ttl_updated",
            updatedBy: principalBytesToString(value.EventsTimeToLiveUpdated.updated_by),
            newTimeToLive: optional(value.EventsTimeToLiveUpdated.new_ttl, identity),
        };
    }
    if ("GroupGateUpdated" in value) {
        return {
            kind: "gate_updated",
            updatedBy: principalBytesToString(value.GroupGateUpdated.updated_by),
        };
    }
    if ("MembersAddedToDefaultChannel" in value) {
        return {
            kind: "members_added_to_default_channel",
            count: value.MembersAddedToDefaultChannel.count,
        };
    }

    if ("ExternalUrlUpdated" in value) {
        return {
            kind: "external_url_updated",
            newUrl: optional(value.ExternalUrlUpdated.new_url, identity),
            updatedBy: principalBytesToString(value.ExternalUrlUpdated.updated_by),
        };
    }

    if ("BotAdded" in value) {
        return {
            kind: "bot_added",
            userId: principalBytesToString(value.BotAdded.user_id),
            addedBy: principalBytesToString(value.BotAdded.added_by),
        };
    }

    if ("BotRemoved" in value) {
        return {
            kind: "bot_removed",
            userId: principalBytesToString(value.BotRemoved.user_id),
            removedBy: principalBytesToString(value.BotRemoved.removed_by),
        };
    }

    if ("BotUpdated" in value) {
        return {
            kind: "bot_updated",
            userId: principalBytesToString(value.BotUpdated.user_id),
            updatedBy: principalBytesToString(value.BotUpdated.updated_by),
        };
    }

    throw new UnsupportedValueError("Unexpected ApiEventWrapper type received", value);
}

export function message(value: ApiMessage): MessageEvent {
    const sender = principalBytesToString(value.sender);
    const content = messageContent(value.content, sender);
    return {
        kind: "message",
        content,
        sender,
        repliesTo: optional(value.replies_to, replyContext),
        messageId: toBigInt64(value.message_id),
        messageIndex: value.message_index,
        reactions: reactions(value.reactions),
        tips: tips(value.tips),
        edited: value.edited,
        forwarded: value.forwarded,
        deleted: content.kind === "deleted_content",
        thread: optional(value.thread_summary, threadSummary),
        blockLevelMarkdown: value.block_level_markdown,
        botContext: optional(value.bot_context, botMessageContext),
    };
}

export function messageContent(value: ApiMessageContent, sender: string): MessageContent {
    if ("File" in value) {
        return fileContent(value.File);
    }
    if ("Text" in value) {
        return textContent(value.Text);
    }
    if ("Image" in value) {
        return imageContent(value.Image);
    }
    if ("Video" in value) {
        return videoContent(value.Video);
    }
    if ("Audio" in value) {
        return audioContent(value.Audio);
    }
    if ("Deleted" in value) {
        return deletedContent(value.Deleted);
    }
    if ("Crypto" in value) {
        return cryptoContent(value.Crypto, sender);
    }
    if ("Poll" in value) {
        return pollContent(value.Poll);
    }
    if ("Giphy" in value) {
        return giphyContent(value.Giphy);
    }
    if ("GovernanceProposal" in value) {
        return proposalContent(value.GovernanceProposal);
    }
    if ("Prize" in value) {
        return prizeContent(value.Prize);
    }
    if ("PrizeWinner" in value) {
        return prizeWinnerContent(sender, value.PrizeWinner);
    }
    if ("MessageReminderCreated" in value) {
        return messageReminderCreated(value.MessageReminderCreated);
    }
    if ("MessageReminder" in value) {
        return messageReminder(value.MessageReminder);
    }
    if ("Custom" in value) {
        return customContent(value.Custom);
    }
    if ("ReportedMessage" in value) {
        return reportedMessage(value.ReportedMessage);
    }
    if ("P2PSwap" in value) {
        return p2pSwapContent(value.P2PSwap);
    }
    if ("VideoCall" in value) {
        return videoCallContent(value.VideoCall);
    }
    throw new UnsupportedValueError("Unexpected ApiMessageContent type received", value);
}

function fileContent(value: ApiFileContent): FileContent {
    return {
        kind: "file_content",
        name: value.name,
        mimeType: value.mime_type,
        blobReference: optional(value.blob_reference, blobReference),
        caption: optional(value.caption, identity),
        fileSize: value.file_size,
    };
}

function blobReference(value: ApiBlobReference): BlobReference {
    return {
        blobId: value.blob_id,
        canisterId: principalBytesToString(value.canister_id),
    };
}

function audioContent(value: ApiAudioContent): AudioContent {
    return {
        kind: "audio_content",
        mimeType: value.mime_type,
        blobReference: optional(value.blob_reference, blobReference),
        caption: optional(value.caption, identity),
    };
}

function textContent(value: ApiTextContent): TextContent {
    return {
        kind: "text_content",
        text: value.text,
    };
}

function imageContent(value: ApiImageContent): ImageContent {
    return {
        kind: "image_content",
        height: value.height,
        mimeType: value.mime_type,
        blobReference: optional(value.blob_reference, blobReference),
        thumbnailData: value.thumbnail_data,
        caption: optional(value.caption, identity),
        width: value.width,
    };
}

function videoContent(value: ApiVideoContent): VideoContent {
    return {
        kind: "video_content",
        height: value.height,
        mimeType: value.mime_type,
        videoData: {
            blobReference: optional(value.video_blob_reference, blobReference),
        },
        imageData: {
            blobReference: optional(value.image_blob_reference, blobReference),
        },
        thumbnailData: value.thumbnail_data,
        caption: optional(value.caption, identity),
        width: value.width,
    };
}

function deletedContent(value: ApiDeletedBy): DeletedContent {
    return {
        kind: "deleted_content",
        deletedBy: principalBytesToString(value.deleted_by),
        timestamp: value.timestamp,
    };
}

function cryptoContent(value: ApiCryptoContent, sender: string): CryptocurrencyContent {
    return {
        kind: "crypto_content",
        caption: optional(value.caption, identity),
        transfer: cryptoTransfer(value.transfer, sender, principalBytesToString(value.recipient)),
    };
}

function cryptoTransfer(
    value: ApiCryptoTransaction,
    sender: string,
    recipient: string,
): CryptocurrencyTransfer {
    if ("Pending" in value) {
        return pendingCryptoTransfer(value.Pending, recipient);
    }
    if ("Completed" in value) {
        return completedCryptoTransfer(value.Completed, sender, recipient);
    }
    if ("Failed" in value) {
        return failedCryptoTransfer(value.Failed, recipient);
    }
    throw new UnsupportedValueError("Unexpected ApiCryptoTransaction type received", value);
}

function pendingCryptoTransfer(
    value: ApiPendingCryptoTransaction,
    recipient: string,
): PendingCryptocurrencyTransfer {
    if ("NNS" in value) {
        const trans = value.NNS;
        return {
            kind: "pending",
            ledger: principalBytesToString(trans.ledger),
            token: token(trans.token),
            recipient,
            amountE8s: trans.amount.e8s,
            feeE8s: optional(trans.fee, (f) => f.e8s),
            memo: trans.memo,
            createdAtNanos: trans.created,
        };
    }
    if ("ICRC1" in value) {
        return {
            kind: "pending",
            ledger: principalBytesToString(value.ICRC1.ledger),
            token: token(value.ICRC1.token),
            recipient,
            amountE8s: value.ICRC1.amount,
            feeE8s: value.ICRC1.fee,
            memo: optional(value.ICRC1.memo, bytesToBigint),
            createdAtNanos: value.ICRC1.created,
        };
    }
    if ("ICRC2" in value) {
        throw new Error("ICRC2 is not supported yet");
    }

    throw new UnsupportedValueError("Unexpected ApiPendingCryptoTransaction type received", value);
}

export function completedCryptoTransfer(
    value: ApiCompletedCryptoTransaction,
    sender: string,
    recipient: string,
): CompletedCryptocurrencyTransfer {
    if ("NNS" in value) {
        const trans = value.NNS;
        return {
            kind: "completed",
            ledger: principalBytesToString(trans.ledger),
            recipient,
            sender,
            amountE8s: trans.amount.e8s,
            feeE8s: trans.fee.e8s,
            memo: trans.memo,
            blockIndex: trans.block_index,
        };
    }

    const trans = "ICRC1" in value ? value.ICRC1 : value.ICRC2;
    return {
        kind: "completed",
        ledger: principalBytesToString(trans.ledger),
        recipient,
        sender,
        amountE8s: trans.amount,
        feeE8s: trans.fee,
        memo: optional(trans.memo, bytesToBigint) ?? BigInt(0),
        blockIndex: trans.block_index,
    };
}

export function failedCryptoTransfer(
    value: ApiFailedCryptoTransaction,
    recipient: string,
): FailedCryptocurrencyTransfer {
    if ("NNS" in value) {
        const trans = value.NNS;
        return {
            kind: "failed",
            ledger: principalBytesToString(trans.ledger),
            recipient,
            amountE8s: trans.amount.e8s,
            feeE8s: trans.fee.e8s,
            memo: trans.memo,
            errorMessage: trans.error_message,
        };
    }

    const trans = "ICRC1" in value ? value.ICRC1 : value.ICRC2;
    return {
        kind: "failed",
        ledger: principalBytesToString(trans.ledger),
        recipient,
        amountE8s: trans.amount,
        feeE8s: trans.fee,
        memo: optional(trans.memo, bytesToBigint) ?? BigInt(0),
        errorMessage: trans.error_message,
    };
}

export function token(value: ApiCryptocurrency): string {
    if (value === "InternetComputer") return ICP_SYMBOL;
    if (value === "SNS1") return SNS1_SYMBOL;
    if (value === "CKBTC") return CKBTC_SYMBOL;
    if (value === "CHAT") return CHAT_SYMBOL;
    if (value === "KINIC") return KINIC_SYMBOL;
    if ("Other" in value) return value.Other;
    throw new UnsupportedValueError("Unexpected Cryptocurrency type received", value);
}

export function bytesToBigint(bytes: Uint8Array | number[]): bigint {
    return BigInt("0x" + bytesToHexString(bytes));
}

export function bytesToHexString(bytes: Uint8Array | number[]): string {
    return consolidateBytes(bytes).reduce(
        (str, byte) => str + byte.toString(16).padStart(2, "0"),
        "",
    );
}

function pollContent(value: ApiPollContent): PollContent {
    return {
        kind: "poll_content",
        votes: pollVotes(value.votes),
        config: pollConfig(value.config),
        ended: value.ended,
    };
}

function pollConfig(value: ApiPollConfig): PollConfig {
    return {
        allowMultipleVotesPerUser: value.allow_multiple_votes_per_user,
        allowUserToChangeVote: value.allow_user_to_change_vote,
        text: value.text,
        showVotesBeforeEndDate: value.show_votes_before_end_date,
        endDate: value.end_date,
        anonymous: value.anonymous,
        options: value.options,
    };
}

function pollVotes(value: ApiPollVotes): PollVotes {
    return {
        total: totalPollVotes(value.total),
        user: value.user,
    };
}

function totalPollVotes(value: ApiTotalVotes): TotalPollVotes {
    if ("Anonymous" in value) {
        return {
            kind: "anonymous_poll_votes",
            votes: Object.entries(value.Anonymous).reduce(
                (agg, [idx, num]) => {
                    agg[Number(idx)] = num;
                    return agg;
                },
                {} as Record<number, number>,
            ),
        };
    }
    if ("Visible" in value) {
        return {
            kind: "visible_poll_votes",
            votes: Object.entries(value.Visible).reduce(
                (agg, [idx, userIds]) => {
                    agg[Number(idx)] = userIds.map(principalBytesToString);
                    return agg;
                },
                {} as Record<number, string[]>,
            ),
        };
    }
    if ("Hidden" in value) {
        return {
            kind: "hidden_poll_votes",
            votes: value.Hidden,
        };
    }
    throw new UnsupportedValueError("Unexpected ApiTotalPollVotes type received", value);
}

function replyContext(value: ApiReplyContext): ReplyContext {
    return {
        kind: "reply_context",
        eventIndex: value.event_index,
        sourceContext: optional(value.chat_if_other, replySourceContext),
    };
}

function replySourceContext([chatId, maybeThreadRoot]: [ApiChat, number | null]): MessageContext {
    if ("Direct" in chatId) {
        return {
            chatId: new DirectChatIdentifier(principalBytesToString(chatId.Direct)),
            threadRootMessageIndex: undefined,
        };
    }
    if ("Group" in chatId) {
        return {
            chatId: new GroupChatIdentifier(principalBytesToString(chatId.Group)),
            threadRootMessageIndex: optional(maybeThreadRoot, identity),
        };
    }
    if ("Channel" in chatId) {
        const [communityId, channelId] = chatId.Channel;
        return {
            chatId: new ChannelIdentifier(
                principalBytesToString(communityId),
                Number(toBigInt32(channelId)),
            ),
            threadRootMessageIndex: optional(maybeThreadRoot, identity),
        };
    }
    throw new UnsupportedValueError("Unexpected ApiMultiUserChat type received", chatId);
}

function giphyContent(value: ApiGiphyContent): GiphyContent {
    return {
        kind: "giphy_content",
        title: value.title,
        caption: value.caption,
        desktop: giphyImageVariant(value.desktop),
        mobile: giphyImageVariant(value.mobile),
    };
}

function giphyImageVariant(value: ApiGiphyImageVariant): GiphyImage {
    return {
        width: value.width,
        height: value.height,
        url: value.url,
        mimeType: value.mime_type,
    };
}

function proposalContent(value: ApiProposalContent): ProposalContent {
    return {
        kind: "proposal_content",
        governanceCanisterId: principalBytesToString(value.governance_canister_id),
        proposal: proposal(value.proposal),
        myVote: value.my_vote,
    };
}

function proposal(value: ApiProposal): Proposal {
    if ("NNS" in value) {
        const p = value.NNS;
        return {
            kind: "nns",
            id: p.id,
            topic: p.topic,
            proposer: p.proposer.toString(),
            title: p.title,
            summary: p.summary,
            url: p.url,
            status: proposalDecisionStatus(p.status),
            rewardStatus: proposalRewardStatus(p.reward_status),
            tally: {
                yes: Number(p.tally.yes / E8S_AS_BIGINT),
                no: Number(p.tally.no / E8S_AS_BIGINT),
                total: Number(p.tally.total / E8S_AS_BIGINT),
                timestamp: p.tally.timestamp,
            },
            lastUpdated: Number(p.last_updated),
            created: Number(p.created),
            deadline: Number(p.deadline),
            payloadTextRendering: p.payload_text_rendering,
            minYesPercentageOfTotal: 3,
            minYesPercentageOfExercised: 50,
        };
    } else if ("SNS" in value) {
        const p = value.SNS;
        return {
            kind: "sns",
            id: p.id,
            action: Number(p.action),
            proposer: bytesToHexString(p.proposer),
            title: p.title,
            summary: p.summary,
            url: p.url,
            status: proposalDecisionStatus(p.status),
            rewardStatus: proposalRewardStatus(p.reward_status),
            tally: {
                yes: Number(p.tally.yes / E8S_AS_BIGINT),
                no: Number(p.tally.no / E8S_AS_BIGINT),
                total: Number(p.tally.total / E8S_AS_BIGINT),
                timestamp: p.tally.timestamp,
            },
            lastUpdated: Number(p.last_updated),
            created: Number(p.created),
            deadline: Number(p.deadline),
            payloadTextRendering: p.payload_text_rendering,
            minYesPercentageOfTotal: p.minimum_yes_proportion_of_total / 100,
            minYesPercentageOfExercised: p.minimum_yes_proportion_of_exercised / 100,
        };
    }
    throw new UnsupportedValueError("Unexpected ApiProposal type received", value);
}

function proposalDecisionStatus(value: ApiProposalDecisionStatus): ProposalDecisionStatus {
    if (value === "Failed") return ProposalDecisionStatus.Failed;
    if (value === "Open") return ProposalDecisionStatus.Open;
    if (value === "Rejected") return ProposalDecisionStatus.Rejected;
    if (value === "Executed") return ProposalDecisionStatus.Executed;
    if (value === "Adopted") return ProposalDecisionStatus.Adopted;
    return ProposalDecisionStatus.Unspecified;
}

function proposalRewardStatus(value: ApiProposalRewardStatus): ProposalRewardStatus {
    if (value === "AcceptVotes") return ProposalRewardStatus.AcceptVotes;
    if (value === "ReadyToSettle") return ProposalRewardStatus.ReadyToSettle;
    if (value === "Settled") return ProposalRewardStatus.Settled;
    return ProposalRewardStatus.Unspecified;
}

function prizeContent(value: ApiPrizeContent): PrizeContent {
    return {
        kind: "prize_content",
        prizesRemaining: value.prizes_remaining,
        prizesPending: value.prizes_pending,
        diamondOnly: value.diamond_only,
        lifetimeDiamondOnly: value.lifetime_diamond_only,
        uniquePersonOnly: value.unique_person_only,
        streakOnly: value.streak_only,
        winners: value.winners.map(principalBytesToString),
        token: token(value.token),
        endDate: value.end_date,
        caption: value.caption,
    };
}

function prizeWinnerContent(senderId: string, value: ApiPrizeWinnerContent): PrizeWinnerContent {
    return {
        kind: "prize_winner_content",
        transaction: completedCryptoTransfer(
            value.transaction,
            senderId,
            principalBytesToString(value.winner),
        ),
        prizeMessageIndex: value.prize_message,
    };
}

function messageReminderCreated(
    value: ApiMessageReminderCreatedContent,
): MessageReminderCreatedContent {
    return {
        kind: "message_reminder_created_content",
        notes: value.notes,
        remindAt: Number(value.remind_at),
        reminderId: value.reminder_id,
        hidden: value.hidden,
    };
}

function messageReminder(value: ApiMessageReminderContent): MessageReminderContent {
    return {
        kind: "message_reminder_content",
        notes: value.notes,
        reminderId: value.reminder_id,
    };
}

function customContent(value: ApiCustomContent): MessageContent {
    if (value.kind === "meme_fighter") {
        const decoder = new TextDecoder();
        const json = decoder.decode(consolidateBytes(value.data));
        const decoded = JSON.parse(json) as { url: string; width: number; height: number };
        return {
            kind: "meme_fighter_content",
            ...decoded,
        };
    }
    if (value.kind === "user_referral_card") {
        return {
            kind: "user_referral_card",
        };
    }

    throw new Error(`Unknown custom content kind received: ${value.kind}`);
}

function reportedMessage(value: ApiReportedMessage): ReportedMessageContent {
    return {
        kind: "reported_message_content",
        total: value.count,
        reports: value.reports.map((r) => ({
            notes: r.notes,
            reasonCode: r.reason_code,
            timestamp: Number(r.timestamp),
            reportedBy: principalBytesToString(r.reported_by),
        })),
    };
}

function p2pSwapContent(value: ApiP2PSwapContent): P2PSwapContent {
    return {
        kind: "p2p_swap_content",
        token0: tokenInfo(value.token0),
        token1: tokenInfo(value.token1),
        token0Amount: value.token0_amount,
        token1Amount: value.token1_amount,
        caption: value.caption,
        expiresAt: value.expires_at,
        status: p2pTradeStatus(value.status),
        swapId: value.swap_id,
        token0TxnIn: value.token0_txn_in,
    };
}

function tokenInfo(value: ApiTokenInfo): TokenInfo {
    return {
        fee: value.fee,
        decimals: value.decimals,
        symbol: token(value.token),
        ledger: principalBytesToString(value.ledger),
    };
}

function p2pTradeStatus(value: ApiP2PSwapStatus): P2PSwapStatus {
    if (value === "Open") {
        return { kind: "p2p_swap_open" };
    }
    if ("Reserved" in value) {
        return {
            kind: "p2p_swap_reserved",
            reservedBy: principalBytesToString(value.Reserved.reserved_by),
        };
    }
    if ("Accepted" in value) {
        return {
            kind: "p2p_swap_accepted",
            acceptedBy: principalBytesToString(value.Accepted.accepted_by),
            token1TxnIn: value.Accepted.token1_txn_in,
        };
    }
    if ("Cancelled" in value) {
        return {
            kind: "p2p_swap_cancelled",
            token0TxnOut: value.Cancelled.token0_txn_out,
        };
    }
    if ("Expired" in value) {
        return {
            kind: "p2p_swap_expired",
            token0TxnOut: value.Expired.token0_txn_out,
        };
    }
    if ("Completed" in value) {
        const { accepted_by, token1_txn_in, token0_txn_out, token1_txn_out } = value.Completed;
        return {
            kind: "p2p_swap_completed",
            acceptedBy: principalBytesToString(accepted_by),
            token1TxnIn: token1_txn_in,
            token0TxnOut: token0_txn_out,
            token1TxnOut: token1_txn_out,
        };
    }

    throw new UnsupportedValueError("Unexpected ApiP2PSwapStatus type received", value);
}

function videoCallContent(value: ApiVideoCallContent): VideoCallContent {
    return {
        kind: "video_call_content",
        ended: value.ended,
        participants: value.participants.map(videoCallParticipant),
        callType: videoCallType(value.call_type),
    };
}

function videoCallParticipant(value: ApiCallParticipant): VideoCallParticipant {
    return {
        userId: principalBytesToString(value.user_id),
        joined: value.joined,
    };
}

function videoCallType(value: ApiVideoCallType): VideoCallType {
    if (value === "Default") {
        return "default";
    }
    if (value === "Broadcast") {
        return "broadcast";
    }
    throw new UnsupportedValueError("Unexpected ApiVideoCallTypye type received", value);
}

function reactions(value: [string, ApiPrincipal[]][]): Reaction[] {
    return value.map(([reaction, userIds]) => ({
        reaction,
        userIds: new Set(userIds.map(principalBytesToString)),
    }));
}

export function threadSummary(value: ApiThreadSummary): ThreadSummary {
    return {
        participantIds: new Set(value.participant_ids.map(principalBytesToString)),
        followedByMe: value.followed_by_me,
        numberOfReplies: Number(value.reply_count),
        latestEventIndex: Number(value.latest_event_index),
        latestEventTimestamp: value.latest_event_timestamp,
    };
}

export function tips(value: [ApiPrincipal, [ApiPrincipal, bigint][]][]): TipsReceived {
    return value.reduce((agg, [ledger, tips]) => {
        agg[principalBytesToString(ledger)] = tips.reduce(
            (userTips, [userId, amount]) => {
                userTips[principalBytesToString(userId)] = amount;
                return userTips;
            },
            {} as Record<string, bigint>,
        );
        return agg;
    }, {} as TipsReceived);
}

export function botMessageContext(value: ApiBotMessageContext): BotMessageContext {
    return {
        finalised: value.finalised,
        command: optional(value.command, (command) => ({
            name: command.name,
            args: command.args.map(botCommandArg),
            initiator: principalBytesToString(command.initiator),
        })),
    };
}

export function botCommandArg(api: BotCommandArg): CommandArg {
    const { name, value } = api;
    if ("Boolean" in value) {
        return {
            kind: "boolean",
            name,
            value: value.Boolean,
        };
    } else if ("Integer" in value) {
        return {
            kind: "integer",
            name,
            value: value.Integer,
        };
    } else if ("Decimal" in value) {
        return {
            kind: "decimal",
            name,
            value: value.Decimal,
        };
    } else if ("String" in value) {
        return {
            kind: "string",
            name,
            value: value.String,
        };
    } else if ("User" in value) {
        return {
            kind: "user",
            name,
            userId: principalBytesToString(value.User),
        };
    } else if ("DateTime" in value) {
        return {
            kind: "dateTime",
            name,
            value: value.DateTime,
        };
    }
    throw new Error(`Unexpected ApiBotCommandArg type received, ${api}`);
}

export function apiChatEventsCriteria(domain: ChatEventsCriteria): ApiChatEventsCriteria {
    switch (domain.kind) {
        case "chat_events_page":
            return {
                Page: {
                    start_index: domain.startEventIndex,
                    ascending: domain.ascending,
                    max_messages: domain.maxMessages,
                    max_events: domain.maxEvents,
                },
            };
        case "chat_events_by_index":
            return {
                ByIndex: {
                    events: domain.eventIndexes,
                },
            };
        case "chat_events_window":
            return {
                Window: {
                    mid_point: domain.midPointMessageIndex,
                    max_messages: domain.maxMessages,
                    max_events: domain.maxEvents,
                },
            };
    }
}
