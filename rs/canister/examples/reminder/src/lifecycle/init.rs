use crate::state;
use crate::state::State;
use candid::CandidType;
use ic_cdk::init;
use serde::{Deserialize, Serialize};

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct InitOrUpgradeArgs {
    pub oc_public_key: String,
}

#[init]
fn init(args: InitOrUpgradeArgs) {
    let state = State::new(args.oc_public_key);
    state::init(state);
}
