export type PermissionRole = "none" | "moderators" | "owners" | "admins" | "members";

export type GroupPermissions = {
    mentionAllMembers: PermissionRole;
    deleteMessages: PermissionRole;
    removeMembers: PermissionRole;
    updateGroup: PermissionRole;
    messagePermissions: MessagePermissions;
    inviteUsers: PermissionRole;
    threadPermissions?: MessagePermissions;
    changeRoles: PermissionRole;
    startVideoCall: PermissionRole;
    addMembers: PermissionRole;
    pinMessages: PermissionRole;
    reactToMessages: PermissionRole;
};

export type CustomPermission = { subtype: string; role: PermissionRole };

export type MessagePermissions = {
    audio?: PermissionRole;
    video?: PermissionRole;
    videoCall?: PermissionRole;
    custom: CustomPermission[];
    file?: PermissionRole;
    poll?: PermissionRole;
    text?: PermissionRole;
    crypto?: PermissionRole;
    giphy?: PermissionRole;
    default: PermissionRole;
    image?: PermissionRole;
    prize?: PermissionRole;
    p2pSwap?: PermissionRole;
};

export type Rules = { text: string; enabled: boolean };

export type AccessGate = LeafGate | CompositeGate;

export type AccessGateConfig = {
    gate: AccessGate;
    expiry: bigint | undefined;
};

export type LeafGate =
    | NoGate
    | NeuronGate
    | PaymentGate
    | DiamondGate
    | LifetimeDiamondGate
    | NftGate
    | CredentialGate
    | TokenBalanceGate
    | UniquePersonGate
    | LockedGate
    | ReferredByMemberGate;

export type CompositeGate = {
    kind: "composite_gate";
    gates: LeafGate[];
    operator: "and" | "or";
};

export type NoGate = { kind: "no_gate" };

export type NftGate = { kind: "nft_gate" };

export type NeuronGate = {
    kind: "neuron_gate";
    governanceCanister: string;
    minStakeE8s?: bigint;
    minDissolveDelay?: bigint;
};

export type PaymentGate = {
    kind: "payment_gate";
    ledgerCanister: string;
    amount: bigint;
    fee: bigint;
};

export type DiamondGate = { kind: "diamond_gate" };

export type LifetimeDiamondGate = { kind: "lifetime_diamond_gate" };

export type UniquePersonGate = { kind: "unique_person_gate" };

export type Credential = {
    credentialName: string;
    issuerCanisterId: string;
    issuerOrigin: string;
    credentialType: string;
    credentialArguments?: Record<string, string | number>;
};

export type CredentialGate = {
    kind: "credential_gate";
    credential: Credential;
};

export type TokenBalanceGate = {
    kind: "token_balance_gate";
    ledgerCanister: string;
    minBalance: bigint;
};

export type LockedGate = {
    kind: "locked_gate";
};

export type ReferredByMemberGate = {
    kind: "referred_by_member_gate";
};
