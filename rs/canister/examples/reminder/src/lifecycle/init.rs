use crate::state;
use crate::state::State;
use candid::CandidType;
use ic_cdk::init;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum InitOrUpgradeArgs {
    Init(InitArgs),
    Upgrade(UpgradeArgs),
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct InitArgs {
    pub oc_public_key: String,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct UpgradeArgs {
    pub oc_public_key: Option<String>,
}

#[init]
fn init(args: InitOrUpgradeArgs) {
    let InitOrUpgradeArgs::Init(args) = args else {
        panic!("Expected InitArgs, got UpgradeArgs");
    };

    let state = State::new(args.oc_public_key);
    state::init(state);
}
