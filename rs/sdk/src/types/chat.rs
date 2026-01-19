use super::{CanisterId, MessageIndex, Milliseconds, TimestampMillis, UserId};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AccessGateConfig {
    pub gate: AccessGate,
    pub expiry: Option<Milliseconds>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub enum AccessGate {
    DiamondMember,
    LifetimeDiamondMember,
    UniquePerson,
    VerifiedCredential(VerifiedCredentialGate),
    SnsNeuron(SnsNeuronGate),
    Payment(PaymentGate),
    TokenBalance(TokenBalanceGate),
    Composite(CompositeGate),
    Locked,
    ReferredByMember,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub struct VerifiedCredentialGate {
    pub issuer_canister_id: CanisterId,
    pub issuer_origin: String,
    pub credential_type: String,
    pub credential_name: String,
    pub credential_arguments: HashMap<String, VerifiedCredentialArgumentValue>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub enum VerifiedCredentialArgumentValue {
    String(String),
    Int(i32),
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub struct SnsNeuronGate {
    pub governance_canister_id: CanisterId,
    pub min_stake_e8s: Option<u64>,
    pub min_dissolve_delay: Option<Milliseconds>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub struct PaymentGate {
    pub ledger_canister_id: CanisterId,
    pub amount: u128,
    pub fee: u128,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub struct TokenBalanceGate {
    pub ledger_canister_id: CanisterId,
    pub min_balance: u128,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub struct CompositeGate {
    pub inner: Vec<AccessGateNonComposite>,
    pub and: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub enum AccessGateNonComposite {
    DiamondMember,
    LifetimeDiamondMember,
    UniquePerson,
    VerifiedCredential(VerifiedCredentialGate),
    SnsNeuron(SnsNeuronGate),
    Payment(PaymentGate),
    TokenBalance(TokenBalanceGate),
    Locked,
    ReferredByMember,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FrozenGroupInfo {
    pub timestamp: TimestampMillis,
    pub frozen_by: UserId,
    pub reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, Eq, PartialEq)]
pub struct VersionedRules {
    pub text: String,
    pub version: u32,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VideoCall {
    pub message_index: MessageIndex,
    pub call_type: VideoCallType,
}

#[derive(Serialize, Deserialize, Clone, Debug, Copy, Default)]
pub enum VideoCallType {
    Broadcast,
    #[default]
    Default,
}
