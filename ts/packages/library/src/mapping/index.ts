import { Principal } from "@dfinity/principal";
import type { BlobReference, AuthToken } from "../domain";
import type {
    PermissionRole as ApiPermissionRole,
    GroupPermissions as ApiGroupPermissions,
    MessagePermissions as ApiMessagePermissions,
    AccessGateConfig as ApiAccessGateConfig,
    AccessGateNonComposite as ApiAccessGateNonComposite,
    AccessGate as ApiAccessGate,
    BlobReference as ApiBlobReference,
    AuthToken as ApiAuthToken,
} from "../services/bot_gateway/candid/types";
import type { AccessGate, AccessGateConfig } from "../domain/access";
import type { GroupPermissions, MessagePermissions, PermissionRole } from "../domain/permissions";

export function apiAuthToken(auth: AuthToken): ApiAuthToken {
    switch (auth.kind) {
        case "api_key":
            return {
                ApiKey: auth.token,
            };
        case "jwt":
            return {
                Jwt: auth.token,
            };
    }
}

export function apiBlobReference(domain: BlobReference): ApiBlobReference {
    return {
        blob_id: domain.blobId,
        canister_id: Principal.fromText(domain.canisterId),
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
                    governance_canister_id: Principal.fromText(domain.governanceCanister),
                    min_stake_e8s: domain.minStakeE8s ? [BigInt(domain.minStakeE8s)] : [],
                    min_dissolve_delay: domain.minDissolveDelay
                        ? [BigInt(domain.minDissolveDelay)]
                        : [],
                },
            };
        case "payment_gate":
            return {
                Payment: {
                    ledger_canister_id: Principal.fromText(domain.ledgerCanister),
                    amount: domain.amount,
                    fee: domain.fee,
                },
            };
        case "diamond_gate":
            return { DiamondMember: null };
        case "lifetime_diamond_gate":
            return { LifetimeDiamondMember: null };
        case "unique_person_gate":
            return { UniquePerson: null };
        case "credential_gate":
            return {
                VerifiedCredential: {
                    credential_name: domain.credential.credentialName,
                    issuer_canister_id: Principal.fromText(domain.credential.issuerCanisterId),
                    issuer_origin: domain.credential.issuerOrigin,
                    credential_type: domain.credential.credentialType,
                    credential_arguments: Object.entries(
                        domain.credential.credentialArguments ?? {},
                    ).map(([k, v]) => [k, typeof v === "string" ? { String: v } : { Int: v }]),
                },
            };
        case "token_balance_gate":
            return {
                TokenBalance: {
                    ledger_canister_id: Principal.fromText(domain.ledgerCanister),
                    min_balance: domain.minBalance,
                },
            };
        case "locked_gate":
            return { Locked: null };
        case "referred_by_member_gate":
            return { ReferredByMember: null };

        default:
            throw new Error(`Received a domain level group gate that we cannot parse: ${domain}`);
    }
}

export function apiPermissionRole(domain: PermissionRole): ApiPermissionRole {
    switch (domain) {
        case "admins":
            return { Admins: null };
        case "members":
            return { Members: null };
        case "moderators":
            return { Moderators: null };
        case "none":
            return { None: null };
        case "owners":
            return { Owner: null };
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

export function apiOptional<A, B>(domain: A | undefined, mapper: (a: A) => B): [] | [B] {
    return domain === undefined ? [] : [mapper(domain)];
}

export function optional<A, B>(api: [] | [A], mapper: (a: A) => B): B | undefined {
    const [inp] = api;
    return inp === undefined ? undefined : mapper(inp);
}

export function identity<A>(a: A): A {
    return a;
}
