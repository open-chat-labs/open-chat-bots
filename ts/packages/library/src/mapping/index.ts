import { Principal } from "@dfinity/principal";
import type { BlobReference, AuthToken } from "../domain";
import type { AccessGate, AccessGateConfig } from "../domain/access";
import type { GroupPermissions, MessagePermissions, PermissionRole } from "../domain/permissions";
import type {
    AuthToken as ApiAuthToken,
    BlobReference as ApiBlobReference,
    AccessGate as ApiAccessGate,
    AccessGateNonComposite as ApiAccessGateNonComposite,
    AccessGateConfig as ApiAccessGateConfig,
    MessagePermissions as ApiMessagePermissions,
    GroupPermissionRole as ApiPermissionRole,
    GroupPermissions as ApiGroupPermissions,
} from "../typebox/typebox";

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

export function principalBytesToString(bytes: Uint8Array): string {
    return Principal.fromUint8Array(bytes).toString();
}

export function principalStringToBytes(principal: string): Uint8Array {
    return Principal.fromText(principal).toUint8Array();
}
