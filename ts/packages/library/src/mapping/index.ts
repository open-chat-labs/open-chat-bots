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
    type DecodedJwt,
    type CommandActionScope,
    type RawApiKeyJwt,
    MergedActionChatScope,
    MergedActionCommunityScope,
    CommunityIdentifier,
    GroupChatIdentifier,
    DirectChatIdentifier,
    ChannelIdentifier,
} from "../domain";
import type {
    AuthToken as ApiAuthToken,
    BlobReference as ApiBlobReference,
    AccessGate as ApiAccessGate,
    AccessGateNonComposite as ApiAccessGateNonComposite,
    AccessGateConfig as ApiAccessGateConfig,
    MessagePermissions as ApiMessagePermissions,
    GroupPermissionRole as ApiPermissionRole,
    GroupPermissions as ApiGroupPermissions,
    LocalUserIndexBotDeleteChannelResponse as BotDeleteChannelResponse,
    LocalUserIndexBotSendMessageResponse as BotSendMessageResponse,
    LocalUserIndexBotCreateChannelResponse as BotCreateChannelResponse,
    Chat,
} from "../typebox/typebox";
import { toBigInt32, toBigInt64 } from "../utils/bigint";

function nullish<T>(val?: T | null | undefined): T | undefined {
    if (val == null) return undefined;
    return val;
}

export function mapApiKeyJwt(api: RawApiKeyJwt): DecodedJwt {
    return {
        ...api,
        kind: "jwt",
        scope: mapApiKeyScope(api.scope),
    };
}

export function mapCommandJwt(api: RawCommandJwt): DecodedJwt {
    return {
        ...api,
        kind: "jwt",
        scope: mapCommandScope(api.scope),
    };
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

export function apiPermissionRole(domain: PermissionRole): ApiPermissionRole {
    switch (domain) {
        case "admins":
            return "Admins";
        case "members":
            return "Members";
        case "moderators":
            return "Moderators";
        case "none":
            return "None";
        case "owners":
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

export function optional<A, B>(api: [] | [A], mapper: (a: A) => B): B | undefined {
    const [inp] = api;
    return inp === undefined ? undefined : mapper(inp);
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
