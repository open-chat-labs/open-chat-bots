use super::{CanisterId, TimestampNanos, UserId};
use crate::utils::{serialize_large_uint, tolerant_enum};
use serde::{Deserialize, Serialize};

pub type TransactionHash = [u8; 32];

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum CryptoTransaction {
    Pending(PendingCryptoTransaction),
    Completed(CompletedCryptoTransaction),
    Failed(FailedCryptoTransaction),
}

impl CryptoTransaction {
    /// None for a kind of ledger this SDK doesn't know
    pub fn ledger_canister_id(&self) -> Option<CanisterId> {
        match self {
            CryptoTransaction::Pending(t) => t.ledger_canister_id(),
            CryptoTransaction::Completed(t) => t.ledger_canister_id(),
            CryptoTransaction::Failed(t) => t.ledger_canister_id(),
        }
    }

    pub fn token_symbol(&self) -> Option<&str> {
        match self {
            CryptoTransaction::Pending(t) => t.token_symbol(),
            CryptoTransaction::Completed(t) => t.token_symbol(),
            CryptoTransaction::Failed(t) => t.token_symbol(),
        }
    }

    /// The amount in the token's smallest units, eg. e8s
    pub fn units(&self) -> Option<u128> {
        match self {
            CryptoTransaction::Pending(t) => t.units(),
            CryptoTransaction::Completed(t) => t.units(),
            CryptoTransaction::Failed(t) => t.units(),
        }
    }
}

/// A transaction on a kind of ledger this SDK doesn't know yet decodes as `Unsupported`, with its
/// kind
#[derive(Serialize, Clone, Debug)]
pub enum PendingCryptoTransaction {
    NNS(nns::PendingCryptoTransaction),
    ICRC1(icrc1::PendingCryptoTransaction),
    ICRC2(icrc2::PendingCryptoTransaction),
    Certified(certified::PendingCryptoTransaction),
    Unsupported(String),
}

tolerant_enum!(
    PendingCryptoTransaction,
    variants: [NNS, ICRC1, ICRC2, Certified, Unsupported],
    units: [],
    unknown: |kind| PendingCryptoTransaction::Unsupported(kind),
);

impl PendingCryptoTransaction {
    pub fn ledger_canister_id(&self) -> Option<CanisterId> {
        match self {
            PendingCryptoTransaction::NNS(t) => Some(t.ledger),
            PendingCryptoTransaction::ICRC1(t) => Some(t.ledger),
            PendingCryptoTransaction::ICRC2(t) => Some(t.ledger),
            PendingCryptoTransaction::Certified(t) => Some(t.ledger),
            PendingCryptoTransaction::Unsupported(_) => None,
        }
    }

    pub fn token_symbol(&self) -> Option<&str> {
        match self {
            PendingCryptoTransaction::NNS(t) => Some(&t.token_symbol),
            PendingCryptoTransaction::ICRC1(t) => Some(&t.token_symbol),
            PendingCryptoTransaction::ICRC2(t) => Some(&t.token_symbol),
            PendingCryptoTransaction::Certified(t) => Some(&t.token_symbol),
            PendingCryptoTransaction::Unsupported(_) => None,
        }
    }

    pub fn units(&self) -> Option<u128> {
        match self {
            PendingCryptoTransaction::NNS(t) => Some(t.amount.e8s().into()),
            PendingCryptoTransaction::ICRC1(t) => Some(t.amount),
            PendingCryptoTransaction::ICRC2(t) => Some(t.amount),
            PendingCryptoTransaction::Certified(t) => Some(t.amount),
            PendingCryptoTransaction::Unsupported(_) => None,
        }
    }
}

/// A transaction on a kind of ledger this SDK doesn't know yet decodes as `Unsupported`, with its
/// kind
#[derive(Serialize, Clone, Debug)]
pub enum CompletedCryptoTransaction {
    NNS(nns::CompletedCryptoTransaction),
    ICRC1(icrc1::CompletedCryptoTransaction),
    ICRC2(icrc2::CompletedCryptoTransaction),
    Unsupported(String),
}

tolerant_enum!(
    CompletedCryptoTransaction,
    variants: [NNS, ICRC1, ICRC2, Unsupported],
    units: [],
    unknown: |kind| CompletedCryptoTransaction::Unsupported(kind),
);

impl CompletedCryptoTransaction {
    pub fn ledger_canister_id(&self) -> Option<CanisterId> {
        match self {
            CompletedCryptoTransaction::NNS(t) => Some(t.ledger),
            CompletedCryptoTransaction::ICRC1(t) => Some(t.ledger),
            CompletedCryptoTransaction::ICRC2(t) => Some(t.ledger),
            CompletedCryptoTransaction::Unsupported(_) => None,
        }
    }

    pub fn token_symbol(&self) -> Option<&str> {
        match self {
            CompletedCryptoTransaction::NNS(t) => Some(&t.token_symbol),
            CompletedCryptoTransaction::ICRC1(t) => Some(&t.token_symbol),
            CompletedCryptoTransaction::ICRC2(t) => Some(&t.token_symbol),
            CompletedCryptoTransaction::Unsupported(_) => None,
        }
    }

    pub fn units(&self) -> Option<u128> {
        match self {
            CompletedCryptoTransaction::NNS(t) => Some(t.amount.e8s().into()),
            CompletedCryptoTransaction::ICRC1(t) => Some(t.amount),
            CompletedCryptoTransaction::ICRC2(t) => Some(t.amount),
            CompletedCryptoTransaction::Unsupported(_) => None,
        }
    }
}

/// A transaction on a kind of ledger this SDK doesn't know yet decodes as `Unsupported`, with its
/// kind
#[derive(Serialize, Clone, Debug)]
pub enum FailedCryptoTransaction {
    NNS(nns::FailedCryptoTransaction),
    ICRC1(icrc1::FailedCryptoTransaction),
    ICRC2(icrc2::FailedCryptoTransaction),
    Unsupported(String),
}

tolerant_enum!(
    FailedCryptoTransaction,
    variants: [NNS, ICRC1, ICRC2, Unsupported],
    units: [],
    unknown: |kind| FailedCryptoTransaction::Unsupported(kind),
);

impl FailedCryptoTransaction {
    pub fn ledger_canister_id(&self) -> Option<CanisterId> {
        match self {
            FailedCryptoTransaction::NNS(t) => Some(t.ledger),
            FailedCryptoTransaction::ICRC1(t) => Some(t.ledger),
            FailedCryptoTransaction::ICRC2(t) => Some(t.ledger),
            FailedCryptoTransaction::Unsupported(_) => None,
        }
    }

    pub fn token_symbol(&self) -> Option<&str> {
        match self {
            FailedCryptoTransaction::NNS(t) => Some(&t.token_symbol),
            FailedCryptoTransaction::ICRC1(t) => Some(&t.token_symbol),
            FailedCryptoTransaction::ICRC2(t) => Some(&t.token_symbol),
            FailedCryptoTransaction::Unsupported(_) => None,
        }
    }

    pub fn units(&self) -> Option<u128> {
        match self {
            FailedCryptoTransaction::NNS(t) => Some(t.amount.e8s().into()),
            FailedCryptoTransaction::ICRC1(t) => Some(t.amount),
            FailedCryptoTransaction::ICRC2(t) => Some(t.amount),
            FailedCryptoTransaction::Unsupported(_) => None,
        }
    }
}

pub mod nns {
    use super::*;

    /// An amount of ICP, encoded as `ic_ledger_types::Tokens` is
    #[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct Tokens {
        e8s: u64,
    }

    impl Tokens {
        pub const fn from_e8s(e8s: u64) -> Self {
            Tokens { e8s }
        }

        pub const fn e8s(&self) -> u64 {
            self.e8s
        }
    }

    /// An account on the ICP ledger, encoded as `ic_ledger_types::AccountIdentifier` is
    #[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct AccountIdentifier(pub [u8; 32]);

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub enum CryptoAccount {
        Mint,
        Account(AccountIdentifier),
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub enum UserOrAccount {
        Account(AccountIdentifier),
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct PendingCryptoTransaction {
        pub ledger: CanisterId,
        pub token_symbol: String,
        pub amount: Tokens,
        pub to: UserOrAccount,
        pub fee: Option<Tokens>,
        pub memo: Option<u64>,
        pub created: TimestampNanos,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct CompletedCryptoTransaction {
        pub ledger: CanisterId,
        pub token_symbol: String,
        pub amount: Tokens,
        pub fee: Tokens,
        pub from: CryptoAccount,
        pub to: CryptoAccount,
        pub memo: u64,
        pub created: TimestampNanos,
        #[serde(default)]
        pub transaction_hash: TransactionHash,
        pub block_index: u64,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct FailedCryptoTransaction {
        pub ledger: CanisterId,
        pub token_symbol: String,
        pub amount: Tokens,
        pub fee: Tokens,
        pub from: CryptoAccount,
        pub to: CryptoAccount,
        pub memo: u64,
        pub created: TimestampNanos,
        #[serde(default)]
        pub transaction_hash: TransactionHash,
        pub error_message: String,
    }
}

pub mod icrc1 {
    use super::*;
    pub use icrc_ledger_types::icrc1::account::Account;
    pub use icrc_ledger_types::icrc1::transfer::Memo;

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub enum CryptoAccount {
        Mint,
        Account(Account),
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct PendingCryptoTransaction {
        pub ledger: CanisterId,
        pub token_symbol: String,
        #[serde(serialize_with = "serialize_large_uint")]
        pub amount: u128,
        pub to: Account,
        #[serde(serialize_with = "serialize_large_uint")]
        pub fee: u128,
        pub memo: Option<Memo>,
        pub created: TimestampNanos,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct CompletedCryptoTransaction {
        pub ledger: CanisterId,
        pub token_symbol: String,
        #[serde(serialize_with = "serialize_large_uint")]
        pub amount: u128,
        pub from: CryptoAccount,
        pub to: CryptoAccount,
        #[serde(serialize_with = "serialize_large_uint")]
        pub fee: u128,
        pub memo: Option<Memo>,
        pub created: TimestampNanos,
        pub block_index: u64,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct FailedCryptoTransaction {
        pub ledger: CanisterId,
        pub token_symbol: String,
        #[serde(serialize_with = "serialize_large_uint")]
        pub amount: u128,
        #[serde(serialize_with = "serialize_large_uint")]
        pub fee: u128,
        pub from: CryptoAccount,
        pub to: CryptoAccount,
        pub memo: Option<Memo>,
        pub created: TimestampNanos,
        pub error_message: String,
    }
}

pub mod icrc2 {
    use super::*;
    use icrc1::{Account, CryptoAccount, Memo};

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct PendingCryptoTransaction {
        pub ledger: CanisterId,
        pub token_symbol: String,
        #[serde(serialize_with = "serialize_large_uint")]
        pub amount: u128,
        pub from: Account,
        pub to: Account,
        #[serde(serialize_with = "serialize_large_uint")]
        pub fee: u128,
        pub memo: Option<Memo>,
        pub created: TimestampNanos,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct CompletedCryptoTransaction {
        pub ledger: CanisterId,
        pub token_symbol: String,
        #[serde(serialize_with = "serialize_large_uint")]
        pub amount: u128,
        pub spender: UserId,
        pub from: CryptoAccount,
        pub to: CryptoAccount,
        #[serde(serialize_with = "serialize_large_uint")]
        pub fee: u128,
        pub memo: Option<Memo>,
        pub created: TimestampNanos,
        pub block_index: u64,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct FailedCryptoTransaction {
        pub ledger: CanisterId,
        pub token_symbol: String,
        #[serde(serialize_with = "serialize_large_uint")]
        pub amount: u128,
        #[serde(serialize_with = "serialize_large_uint")]
        pub fee: u128,
        pub spender: UserId,
        pub from: CryptoAccount,
        pub to: CryptoAccount,
        pub memo: Option<Memo>,
        pub created: TimestampNanos,
        pub error_message: String,
    }
}

/// An ICRC1 transfer the user has already made by calling the ledger themselves, which `call` proves
/// the ledger accepted
pub mod certified {
    use super::*;
    use icrc1::{Account, Memo};

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct PendingCryptoTransaction {
        pub ledger: CanisterId,
        pub token_symbol: String,
        #[serde(serialize_with = "serialize_large_uint")]
        pub amount: u128,
        pub to: Account,
        #[serde(serialize_with = "serialize_large_uint")]
        pub fee: u128,
        pub memo: Option<Memo>,
        pub created: TimestampNanos,
        pub call: CertifiedCall,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct CertifiedCall {
        pub arg: Vec<u8>,
        pub ingress_expiry: u64,
        pub nonce: Option<Vec<u8>>,
        pub certificate: Vec<u8>,
    }
}
