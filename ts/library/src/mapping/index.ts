import { Principal } from "@dfinity/principal";
import {
    type AccessGate,
    type AccessGateConfig,
    ActionScope,
    type AudioContent,
    type BlobReference,
    type BotChatContext,
    type BotChatEvent,
    type BotCommunityEvent,
    type BotCommunityOrGroupContext,
    type BotEvent,
    type BotEventWrapper,
    type BotLifecycleEvent,
    type BotMessageContext,
    ChannelIdentifier,
    ChatActionScope,
    type ChatEvent,
    type ChatEventsCriteria,
    type ChatEventsResponse,
    type ChatEventsSuccess,
    type ChatEventWrapper,
    type ChatIdentifier,
    type ChatSummaryResponse,
    type CommandActionScope,
    type CommandArg,
    CommunityActionScope,
    type CommunityEvent,
    type CommunityEventsCriteria,
    CommunityIdentifier,
    type CommunityOrGroup,
    type CommunityPermissions,
    type CompletedCryptocurrencyTransfer,
    type CreateChannelResponse,
    type CryptocurrencyContent,
    type CryptocurrencyTransfer,
    DecodedJwt,
    type DeleteChannelResponse,
    type DeletedContent,
    DirectChatIdentifier,
    type FailedCryptocurrencyTransfer,
    type FileContent,
    type FrozenGroupInfo,
    type GiphyContent,
    type GiphyImage,
    GroupChatIdentifier,
    type GroupInviteCodeChange,
    type GroupPermissions,
    type ImageContent,
    type InstallationLocation,
    type LeafGate,
    type MessageContent,
    type MessageContext,
    type MessageEvent,
    type MessagePermissions,
    type MessageReminderContent,
    type MessageReminderCreatedContent,
    type P2PSwapContent,
    type P2PSwapStatus,
    type PendingCryptocurrencyTransfer,
    type PermissionRole,
    Permissions,
    type PollConfig,
    type PollContent,
    type PollVotes,
    type PrizeContent,
    type PrizeWinnerContent,
    type Proposal,
    type ProposalContent,
    ProposalDecisionStatus,
    ProposalRewardStatus,
    type RawCommandJwt,
    type Reaction,
    type ReplyContext,
    type ReportedMessageContent,
    type SenderContext,
    type SendMessageResponse,
    type Success,
    type TextContent,
    type ThreadSummary,
    type TipsReceived,
    type TokenInfo,
    type TotalPollVotes,
    type VideoCall,
    type VideoCallContent,
    type VideoCallParticipant,
    type VideoCallType,
    type VideoContent,
} from "../domain";
import type {
    ChannelSummary,
    CommunityEventsResponse,
    CommunityEventsSuccess,
    CommunityEventWrapper,
    CommunitySummary,
    CommunitySummaryResponse,
    DirectChatSummary,
    GroupChatSummary,
    MembersResponse,
    OCError,
} from "../domain/response";
import {
    type AccessGate as ApiAccessGate,
    type AccessGateConfig as ApiAccessGateConfig,
    type AccessGateNonComposite as ApiAccessGateNonComposite,
    type AudioContent as ApiAudioContent,
    type BlobReference as ApiBlobReference,
    type BotChatContext as ApiBotChatContext,
    type BotChatEvent as ApiBotChatEvent,
    type BotCommunityEvent as ApiBotCommunityEvent,
    type BotCommunityOrGroupContext as ApiBotCommunityOrGroupContext,
    type BotEvent as ApiBotEvent,
    type BotEventWrapper as ApiBotEventWrapper,
    type BotInstallationLocation as ApiBotInstallationLocation,
    type BotLifecycleEvent as ApiBotLifecycleEvent,
    type BotMessageContext as ApiBotMessageContext,
    type CallParticipant as ApiCallParticipant,
    type CommunityChannelSummary as ApiChannelSummary,
    Chat as ApiChat,
    type ChatEvent as ApiChatEvent,
    type LocalUserIndexChatEventsEventsSelectionCriteria as ApiChatEventsCriteria,
    type CommunityEvent as ApiCommunityEvent,
    type CommunityCommunityEventsEventsSelectionCriteria as ApiCommunityEventsCriteria,
    type CommunityCommunityEventsEventsResponse as ApiCommunityEventsResponse,
    type CommunityOrGroup as ApiCommunityOrGroup,
    type CommunityPermissionRole as ApiCommunityPermissionRole,
    type CommunityPermissions as ApiCommunityPermissions,
    type CommunityRole as ApiCommunityRole,
    CommunityCommunitySummary as ApiCommunitySummary,
    type CompletedCryptoTransaction as ApiCompletedCryptoTransaction,
    type CryptoContent as ApiCryptoContent,
    type CryptoTransaction as ApiCryptoTransaction,
    type CustomContent as ApiCustomContent,
    type DeletedBy as ApiDeletedBy,
    type EventsResponse as ApiEventsResponse,
    type EventWrapperChatEvent as ApiEventWrapperChatEvent,
    type EventWrapperCommunityEvent as ApiEventWrapperCommunityEvent,
    type FailedCryptoTransaction as ApiFailedCryptoTransaction,
    type FileContent as ApiFileContent,
    type FrozenGroupInfo as ApiFrozenGroupInfo,
    type GiphyContent as ApiGiphyContent,
    type GiphyImageVariant as ApiGiphyImageVariant,
    type GroupPermissions as ApiGroupPermissions,
    type GroupRole as ApiGroupRole,
    type ImageContent as ApiImageContent,
    MembersResponse as ApiMembersResponse,
    type Message as ApiMessage,
    type MessageContent as ApiMessageContent,
    type MessagePermissions as ApiMessagePermissions,
    type MessageReminderContent as ApiMessageReminderContent,
    type MessageReminderCreatedContent as ApiMessageReminderCreatedContent,
    type OCError as ApiOCError,
    type P2PSwapContent as ApiP2PSwapContent,
    type P2PSwapStatus as ApiP2PSwapStatus,
    type PendingCryptoTransaction as ApiPendingCryptoTransaction,
    type GroupPermissionRole as ApiPermissionRole,
    type PollConfig as ApiPollConfig,
    type PollContent as ApiPollContent,
    type PollVotes as ApiPollVotes,
    type PrizeContent as ApiPrizeContent,
    type PrizeWinnerContent as ApiPrizeWinnerContent,
    type Proposal as ApiProposal,
    type ProposalContent as ApiProposalContent,
    type ProposalDecisionStatus as ApiProposalDecisionStatus,
    type ProposalRewardStatus as ApiProposalRewardStatus,
    type ReplyContext as ApiReplyContext,
    type ReportedMessage as ApiReportedMessage,
    type SenderContext as ApiSenderContext,
    type TextContent as ApiTextContent,
    type ThreadSummary as ApiThreadSummary,
    type TokenInfo as ApiTokenInfo,
    type TotalVotes as ApiTotalVotes,
    type VideoCall as ApiVideoCall,
    type VideoCallContent as ApiVideoCallContent,
    type VideoCallType as ApiVideoCallType,
    type VideoContent as ApiVideoContent,
    type LocalUserIndexBotChatEventsResponse as BotChatEventsResponse,
    type LocalUserIndexBotChatSummaryResponse as BotChatSummaryResponse,
    BotCommandArg,
    type CommunityCommunityEventsResponse as BotCommunityEventsResponse,
    type LocalUserIndexBotCommunitySummaryResponse as BotCommunitySummaryResponse,
    type LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse,
    type UnitResult as BotDeleteChannelResponse,
    type LocalUserIndexBotSendMessageResponse as BotSendMessageResponse,
    type Chat,
    ChatSummary,
    MemberType,
} from "../typebox/typebox";
import { toBigInt32, toBigInt64 } from "../utils/bigint";
import { UnsupportedValueError } from "../utils/error";

const E8S_AS_BIGINT = BigInt(100_000_000);
type ApiPrincipal = Uint8Array | number[] | string;

function nullish<T>(val?: T | null | undefined): T | undefined {
    if (val == null) return undefined;
    return val;
}

export function unitResult(
    value: "Success" | { Success: unknown } | { SuccessV2: unknown } | { Error: ApiOCError },
): Success | OCError {
    if (value === "Success") return { kind: "success" };
    return mapResult(value, () => ({ kind: "success" }));
}

export function mapResult<I, O>(
    value: { Success: I } | { SuccessV2: I } | { Error: ApiOCError },
    mapper: (input: I) => O,
): O | OCError {
    if (typeof value === "object") {
        if ("Success" in value) {
            return mapper(value.Success);
        }
        if ("SuccessV2" in value) {
            return mapper(value.SuccessV2);
        }
        if ("Error" in value) {
            return ocError(value.Error);
        }
    }
    console.error("Unexpected response type", value);
    return {
        kind: "error",
        code: -1,
        message: JSON.stringify(value),
    };
}

export function ocError(error: ApiOCError): OCError {
    return {
        kind: "error",
        code: error[0],
        message: error[1] ?? undefined,
    };
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

export function mapCommandScope(api: CommandActionScope): ActionScope {
    if ("Chat" in api) {
        return new ChatActionScope(mapChatIdentifier(api.Chat.chat));
    }
    if ("Community" in api) {
        return new CommunityActionScope(
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
            toBigInt32(api.Channel[1]),
        );
    }
    throw new Error(`Unexpected Chat type received: ${api}`);
}

export function membersResponse(api: ApiMembersResponse): MembersResponse {
    return mapResult(api, (success) => {
        const entries: [MemberType, string[]][] = Object.entries(success.members_map).map(
            ([k, v]) => [k as MemberType, v.map(principalBytesToString)],
        );
        return { kind: "success", members: new Map<MemberType, string[]>(entries) };
    });
}

export function sendMessageResponse(api: BotSendMessageResponse): SendMessageResponse {
    return mapResult(api, (success) => ({
        kind: "success",
        messageId: toBigInt64(success.message_id),
        eventIndex: success.event_index,
        messageIndex: success.message_index,
        timestamp: success.timestamp,
        expiresAt: nullish(success.expires_at),
    }));
}

export function createChannelResponse(api: BotCreateChannelResponse): CreateChannelResponse {
    return mapResult(api, (success) => ({
        kind: "success",
        channelId: toBigInt32(success.channel_id),
    }));
}

export function deleteChannelResponse(api: BotDeleteChannelResponse): DeleteChannelResponse {
    return unitResult(api);
}

export function communitySummaryResponse(
    api: BotCommunitySummaryResponse,
): CommunitySummaryResponse {
    return mapResult(api, communitySummary);
}

export function chatSummaryResponse(api: BotChatSummaryResponse): ChatSummaryResponse {
    return mapResult(api, chatSummary);
}

export function chatEventsResponse(api: BotChatEventsResponse): ChatEventsResponse {
    return mapResult(api, chatEventsSuccessResponse);
}

export function communityEventsResponse(api: BotCommunityEventsResponse): CommunityEventsResponse {
    return mapResult(api, communityEventsSuccessResponse);
}

function communityEventsSuccessResponse(api: ApiCommunityEventsResponse): CommunityEventsSuccess {
    return {
        kind: "success",
        events: api.events.map(communityEventWrapper),
        unauthorized: api.unauthorized,
        latestEventIndex: api.latest_event_index,
        communityLastUpdated: api.community_last_updated,
    };
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

function communitySummary(api: ApiCommunitySummary): CommunitySummary {
    return {
        kind: "community_summary",
        id: new CommunityIdentifier(principalBytesToString(api.community_id)),
        lastUpdated: api.last_updated,
        name: api.name,
        description: api.description,
        avatarId: optional(api.avatar_id, identity),
        bannerId: optional(api.banner_id, identity),
        isPublic: api.is_public,
        verified: api.verified,
        memberCount: api.member_count,
        permissions: communityPermissions(api.permissions),
        publicChannels: api.public_channels.map(channelSummary),
        rules: api.rules,
        frozen: optional(api.frozen, frozenGroupInfo),
        gateConfig: optional(api.gate_config, accessGateConfig),
        primaryLanguage: api.primary_language,
        latestEventIndex: api.latest_event_index,
    };
}

function channelSummary(api: ApiChannelSummary): ChannelSummary {
    return {
        channelId: toBigInt32(api.channel_id),
        lastUpdated: api.last_updated,
        name: api.name,
    };
}

function chatSummary(api: ChatSummary): GroupChatSummary | DirectChatSummary {
    if ("Group" in api) {
        const group = api.Group;
        return {
            kind: "group_chat",
            name: group.name,
            description: group.description,
            avatarId: group.avatar_id,
            isPublic: group.is_public,
            historyVisibleToNewJoiners: group.history_visible_to_new_joiners,
            messagesVisibleToNonMembers: group.messages_visible_to_non_members,
            permissions: groupPermissions(group.permissions),
            rules: group.rules,
            eventsTtl: group.events_ttl,
            eventsTtlLastUpdated: group.events_ttl_last_updated,
            gateConfig: optional(group.gate_config, accessGateConfig),
            videoCallInProgress: optional(group.video_call_in_progress, videoCall),
            verified: group.verified ?? false,
            frozen: optional(group.frozen, frozenGroupInfo),
            dateLastPinned: group.date_last_pinned,
            lastUpdated: group.last_updated,
            externalUrl: group.external_url,
            latestEventIndex: group.latest_event_index,
            latestMessageIndex: group.latest_message_index,
            memberCount: group.member_count,
        };
    }

    if ("Direct" in api) {
        const direct = api.Direct;
        return {
            kind: "direct_chat",
            eventsTtl: direct.events_ttl,
            eventsTtlLastUpdated: direct.events_ttl_last_updated,
            videoCallInProgress: optional(direct.video_call_in_progress, videoCall),
            lastUpdated: direct.last_updated,
            latestEventIndex: direct.latest_event_index,
            latestMessageIndex: direct.latest_message_index,
        };
    }

    throw new Error(`Unexpected ChatSummary type received: ${api}`);
}

function communityPermissions(api: ApiCommunityPermissions): CommunityPermissions {
    return {
        changeRoles: permissionRole(api.change_roles),
        updateDetails: permissionRole(api.update_details),
        inviteUsers: permissionRole(api.invite_users),
        removeMembers: permissionRole(api.remove_members),
        createPublicChannel: permissionRole(api.create_public_channel),
        createPrivateChannel: permissionRole(api.create_private_channel),
        manageUserGroups: permissionRole(api.manage_user_groups),
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

export function permissionRole(
    api: ApiPermissionRole | ApiGroupRole | ApiCommunityRole | ApiCommunityPermissionRole,
): PermissionRole {
    switch (api) {
        case "Owners":
            return "owner";
        case "Admin":
            return "admin";
        case "Admins":
            return "admin";
        case "Members":
            return "member";
        case "Member":
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

export function communityEventWrapper(value: ApiEventWrapperCommunityEvent): CommunityEventWrapper {
    return {
        event: communityEvent(value.event),
        index: value.index,
        timestamp: value.timestamp,
        expiresAt: optional(value.expires_at, BigInt),
    };
}

export function eventWrapper(value: ApiEventWrapperChatEvent): ChatEventWrapper {
    return {
        event: event(value.event),
        index: value.index,
        timestamp: value.timestamp,
        expiresAt: optional(value.expires_at, BigInt),
    };
}

export function communityEvent(value: ApiCommunityEvent): CommunityEvent {
    if (value === "FailedToDeserialize") {
        return { kind: "empty" };
    }

    if ("Created" in value) {
        return {
            kind: "group_chat_created",
            name: value.Created.name,
            description: value.Created.description,
            created_by: principalBytesToString(value.Created.created_by),
        };
    }
    if ("NameChanged" in value) {
        return {
            kind: "community_name_changed",
            changedBy: principalBytesToString(value.NameChanged.changed_by),
        };
    }

    if ("DescriptionChanged" in value) {
        return {
            kind: "community_description_changed",
            changedBy: principalBytesToString(value.DescriptionChanged.changed_by),
        };
    }

    if ("RulesChanged" in value) {
        return {
            kind: "community_rules_changed",
            enabled: value.RulesChanged.enabled,
            enabledPrev: value.RulesChanged.prev_enabled,
            changedBy: principalBytesToString(value.RulesChanged.changed_by),
        };
    }

    if ("AvatarChanged" in value) {
        return {
            kind: "avatar_changed",
            changedBy: principalBytesToString(value.AvatarChanged.changed_by),
        };
    }

    if ("BannerChanged" in value) {
        return {
            kind: "banner_changed",
            changedBy: principalBytesToString(value.BannerChanged.changed_by),
        };
    }

    if ("UsersInvited" in value) {
        return {
            kind: "users_invited",
            userIds: value.UsersInvited.user_ids.map(principalBytesToString),
            invitedBy: principalBytesToString(value.UsersInvited.invited_by),
        };
    }

    if ("MemberJoined" in value) {
        return {
            kind: "member_joined",
            userId: principalBytesToString(value.MemberJoined.user_id),
        };
    }

    if ("MembersRemoved" in value) {
        return {
            kind: "members_removed",
            userIds: value.MembersRemoved.user_ids.map(principalBytesToString),
            removedBy: principalBytesToString(value.MembersRemoved.removed_by),
        };
    }

    if ("MemberLeft" in value) {
        return {
            kind: "member_left",
            userId: principalBytesToString(value.MemberLeft.user_id),
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

    if ("PermissionsChanged" in value) {
        return {
            kind: "community_permissions_changed",
            oldPermissions: communityPermissions(value.PermissionsChanged.old_permissions),
            newPermissions: communityPermissions(value.PermissionsChanged.new_permissions),
            changedBy: principalBytesToString(value.PermissionsChanged.changed_by),
        };
    }

    if ("VisibilityChanged" in value) {
        return {
            kind: "community_visibility_changed",
            public: optional(value.VisibilityChanged.now_public, identity),
            changedBy: principalBytesToString(value.VisibilityChanged.changed_by),
        };
    }

    if ("InviteCodeChanged" in value) {
        let change: GroupInviteCodeChange = "disabled";
        if (value.InviteCodeChanged.change === "Enabled") {
            change = "enabled";
        } else if (value.InviteCodeChanged.change === "Reset") {
            change = "reset";
        }

        return {
            kind: "group_invite_code_changed",
            change,
            changedBy: principalBytesToString(value.InviteCodeChanged.changed_by),
        };
    }

    if ("Frozen" in value) {
        return {
            kind: "community_frozen",
            frozenBy: principalBytesToString(value.Frozen.frozen_by),
            reason: optional(value.Frozen.reason, identity),
        };
    }

    if ("Unfrozen" in value) {
        return {
            kind: "community_unfrozen",
            unfrozenBy: principalBytesToString(value.Unfrozen.unfrozen_by),
        };
    }

    if ("GateUpdated" in value) {
        return {
            kind: "gate_updated",
            updatedBy: principalBytesToString(value.GateUpdated.updated_by),
        };
    }

    if ("ChannelCreated" in value) {
        return {
            kind: "channel_created",
            name: value.ChannelCreated.name,
            isPublic: value.ChannelCreated.is_public,
            channelId: toBigInt32(value.ChannelCreated.channel_id),
            createdBy: principalBytesToString(value.ChannelCreated.created_by),
        };
    }

    if ("ChannelDeleted" in value) {
        return {
            kind: "channel_deleted",
            name: value.ChannelDeleted.name,
            channelId: toBigInt32(value.ChannelDeleted.channel_id),
            deletedBy: principalBytesToString(value.ChannelDeleted.deleted_by),
            botCommand: value.ChannelDeleted.bot_command,
        };
    }

    if ("PrimaryLanguageChanged" in value) {
        return {
            kind: "primary_language_changed",
            previous: value.PrimaryLanguageChanged.previous,
            new: value.PrimaryLanguageChanged.new,
            changedBy: principalBytesToString(value.PrimaryLanguageChanged.changed_by),
        };
    }

    if ("GroupImported" in value) {
        return {
            kind: "group_imported",
            groupId: principalBytesToString(value.GroupImported.group_id),
            channelId: toBigInt32(value.GroupImported.channel_id),
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

    return { kind: "empty" };
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
        senderContext: optional(value.sender_context, senderContext),
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
    if ("Encrypted" in value) {
        throw new Error("Encrypted content not supported yet");
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
            token: trans.token_symbol,
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
            token: value.ICRC1.token_symbol,
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
                toBigInt32(channelId),
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
        token: value.token_symbol,
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
        symbol: value.symbol,
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

export function senderContext(value: ApiSenderContext): SenderContext {
    if (value === "Webhook") {
        return {
            kind: "webhook",
        };
    } else {
        return botMessageContext(value.Bot);
    }
}

export function botMessageContext(value: ApiBotMessageContext): BotMessageContext {
    return {
        kind: "bot",
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

export function apiCommunityEventsCriteria(
    domain: CommunityEventsCriteria,
): ApiCommunityEventsCriteria {
    switch (domain.kind) {
        case "community_events_page":
            return {
                Page: {
                    start_index: domain.startEventIndex,
                    ascending: domain.ascending,
                    max_events: domain.maxEvents,
                },
            };
        case "community_events_by_index":
            return {
                ByIndex: {
                    events: domain.eventIndexes,
                },
            };
    }
}

export function apiBotCommunityOrGroupContext(
    domain: BotCommunityOrGroupContext,
): ApiBotCommunityOrGroupContext {
    switch (domain.kind) {
        case "command":
            return { Command: domain.jwt };
        case "autonomous":
            return { Autonomous: apiCommunityOrGroup(domain.communityOrGroup) };
    }
}

export function apiCommunityOrGroup(domain: CommunityOrGroup): ApiCommunityOrGroup {
    switch (domain.kind) {
        case "community":
            return { Community: principalStringToBytes(domain.communityId) };
        case "group_chat":
            return { Group: principalStringToBytes(domain.groupId) };
    }
}

export function apiBotChatContext(domain: BotChatContext): ApiBotChatContext {
    switch (domain.kind) {
        case "command":
            return { Command: domain.jwt };
        case "autonomous":
            return { Autonomous: apiChatIdentifier(domain.chatId) };
    }
}

export function apiChatIdentifier(domain: ChatIdentifier): ApiChat {
    if (domain.isChannel()) {
        return { Channel: [principalStringToBytes(domain.communityId), domain.channelId] };
    } else if (domain.isDirectChat()) {
        return { Direct: principalStringToBytes(domain.userId) };
    } else if (domain.isGroupChat()) {
        return { Group: principalStringToBytes(domain.groupId) };
    }
    throw new Error("Unexpected ChatIdentifier received");
}

export function botEventWrapper(api: ApiBotEventWrapper): BotEventWrapper {
    return {
        kind: "bot_event_wrapper",
        apiGateway: principalBytesToString(api.api_gateway),
        event: botEvent(api.event),
        timestamp: api.timestamp,
    };
}

export function botEvent(api: ApiBotEvent): BotEvent {
    if ("Chat" in api) {
        return botChatEvent(api.Chat);
    } else if ("Community" in api) {
        return botCommunityEvent(api.Community);
    } else if ("Lifecycle" in api) {
        return botLifecycleEvent(api.Lifecycle);
    }
    throw new Error("Unexpected ApiBotEvent received");
}

export function botChatEvent(api: ApiBotChatEvent): BotChatEvent {
    return {
        kind: "bot_chat_event",
        event: event(api.event),
        chatId: mapChatIdentifier(api.chat),
        thread: optional(api.thread, identity),
        eventIndex: api.event_index,
        latestEventIndex: api.latest_event_index,
        initiatedBy: undefined, // TODO - check why this is not here
    };
}

export function botCommunityEvent(api: ApiBotCommunityEvent): BotCommunityEvent {
    return {
        kind: "bot_community_event",
        event: communityEvent(api.event),
        communityId: new CommunityIdentifier(principalBytesToString(api.community_id)),
        eventIndex: api.event_index,
        latestEventIndex: api.latest_event_index,
        initiatedBy: undefined, // TODO - check why this is not here
    };
}

export function botLifecycleEvent(api: ApiBotLifecycleEvent): BotLifecycleEvent {
    if ("Registered" in api) {
        return {
            kind: "bot_registered_event",
            botId: principalBytesToString(api.Registered.bot_id),
            botName: api.Registered.bot_name,
        };
    } else if ("Installed" in api) {
        return {
            kind: "bot_installed_event",
            installedBy: principalBytesToString(api.Installed.installed_by),
            location: installationLocation(api.Installed.location),
            grantedCommandPermissions: new Permissions(api.Installed.granted_command_permissions),
            grantedAutonomousPermissions: new Permissions(
                api.Installed.granted_autonomous_permissions,
            ),
        };
    } else if ("Uninstalled" in api) {
        return {
            kind: "bot_uninstalled_event",
            uninstalledBy: principalBytesToString(api.Uninstalled.uninstalled_by),
            location: installationLocation(api.Uninstalled.location),
        };
    }
    throw new Error("Unexpected ApiBotLifecycleEvent received");
}

export function installationLocation(api: ApiBotInstallationLocation): InstallationLocation {
    if ("Community" in api) {
        return new CommunityIdentifier(principalBytesToString(api.Community));
    } else if ("Group" in api) {
        return new GroupChatIdentifier(principalBytesToString(api.Group));
    } else if ("User" in api) {
        return new DirectChatIdentifier(principalBytesToString(api.User));
    }
    throw new Error("Unexpected ApiBotInstallationLocation received");
}
