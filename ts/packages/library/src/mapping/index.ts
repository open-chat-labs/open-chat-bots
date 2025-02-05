import { Principal } from "@dfinity/principal";
import type {
    GroupPermissions,
    MessagePermissions,
    PermissionRole,
    AccessGate,
    AccessGateConfig,
    LeafGate,
} from "../domain/index";
import type {
    PermissionRole as ApiPermissionRole,
    GroupPermissions as ApiGroupPermissions,
    MessagePermissions as ApiMessagePermissions,
    AccessGateConfig as ApiAccessGateConfig,
    AccessGateNonComposite as ApiAccessGateNonComposite,
    AccessGate as ApiAccessGate,
} from "../services/bot_gateway/candid/types";

export function accessGateConfig(api: ApiAccessGateConfig): AccessGateConfig {
    return {
        gate: accessGate(api.gate),
        expiry: optional(api.expiry, identity),
    };
}

export function accessGate(api: ApiAccessGate): AccessGate {
    if ("Composite" in api) {
        return {
            kind: "composite_gate",
            gates: api.Composite.inner.map(leafAccessGate),
            operator: api.Composite.and ? "and" : "or",
        };
    }
    return leafAccessGate(api);
}

export function leafAccessGate(api: ApiAccessGateNonComposite): LeafGate {
    if ("DiamondMember" in api) {
        return { kind: "diamond_gate" };
    }
    if ("SnsNeuron" in api) {
        return {
            kind: "neuron_gate",
            governanceCanister: api.SnsNeuron.governance_canister_id.toString(),
            minStakeE8s: optional(api.SnsNeuron.min_stake_e8s, identity),
            minDissolveDelay: optional(api.SnsNeuron.min_dissolve_delay, identity),
        };
    }
    if ("Payment" in api) {
        return {
            kind: "payment_gate",
            ledgerCanister: api.Payment.ledger_canister_id.toString(),
            amount: api.Payment.amount,
            fee: api.Payment.fee,
        };
    }
    if ("LifetimeDiamondMember" in api) {
        return { kind: "lifetime_diamond_gate" };
    }
    if ("UniquePerson" in api) {
        return { kind: "unique_person_gate" };
    }
    if ("VerifiedCredential" in api) {
        return {
            kind: "credential_gate",
            credential: {
                credentialName: api.VerifiedCredential.credential_name,
                issuerCanisterId: api.VerifiedCredential.issuer_canister_id.toString(),
                issuerOrigin: api.VerifiedCredential.issuer_origin,
                credentialType: api.VerifiedCredential.credential_type,
                credentialArguments: Object.fromEntries(
                    api.VerifiedCredential.credential_arguments.map(([key, value]) => [
                        key,
                        "Int" in value ? value.Int : value.String,
                    ]),
                ),
            },
        };
    }
    if ("TokenBalance" in api) {
        return {
            kind: "token_balance_gate",
            ledgerCanister: api.TokenBalance.ledger_canister_id.toString(),
            minBalance: api.TokenBalance.min_balance,
        };
    }
    if ("Locked" in api) {
        return { kind: "locked_gate" };
    }
    if ("ReferredByMember" in api) {
        return { kind: "referred_by_member_gate" };
    }
    return { kind: "no_gate" };
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
        case "no_gate":
            return { DiamondMember: null };
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

export function permissionRole(api: ApiPermissionRole): PermissionRole {
    if ("Admins" in api) {
        return "admins";
    }
    if ("Members" in api) {
        return "members";
    }
    if ("Moderators" in api) {
        return "moderators";
    }
    if ("None" in api) {
        return "none";
    }
    if ("Owner" in api) {
        return "owners";
    }
    throw new Error("Unknown permission role");
}

export function messagePermissions(api: ApiMessagePermissions): MessagePermissions {
    return {
        audio: optional(api.audio, permissionRole),
        video: optional(api.video, permissionRole),
        videoCall: optional(api.video_call, permissionRole),
        custom: api.custom.map((p) => ({
            subtype: p.subtype,
            role: permissionRole(p.role),
        })),
        file: optional(api.file, permissionRole),
        poll: optional(api.poll, permissionRole),
        text: optional(api.text, permissionRole),
        crypto: optional(api.crypto, permissionRole),
        giphy: optional(api.giphy, permissionRole),
        default: permissionRole(api.default),
        image: optional(api.image, permissionRole),
        prize: optional(api.prize, permissionRole),
        p2pSwap: optional(api.p2p_swap, permissionRole),
    };
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

export function groupPermissions(api: ApiGroupPermissions): GroupPermissions {
    return {
        mentionAllMembers: permissionRole(api.mention_all_members),
        deleteMessages: permissionRole(api.delete_messages),
        removeMembers: permissionRole(api.remove_members),
        updateGroup: permissionRole(api.update_group),
        messagePermissions: messagePermissions(api.message_permissions),
        inviteUsers: permissionRole(api.invite_users),
        threadPermissions: optional(api.thread_permissions, messagePermissions),
        changeRoles: permissionRole(api.change_roles),
        startVideoCall: permissionRole(api.start_video_call),
        addMembers: permissionRole(api.add_members),
        pinMessages: permissionRole(api.pin_messages),
        reactToMessages: permissionRole(api.react_to_messages),
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
