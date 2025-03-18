use crate::memory::get_upgrades_memory;
use candid::{CandidType, Principal};
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use ic_http_certification::{HttpRequest, HttpResponse};
use ic_stable_structures::{
    reader::{BufferedReader, Reader},
    writer::{BufferedWriter, Writer},
};
use oc_bots_sdk_canister::env;
use serde::{Deserialize, Serialize};
use state::State;
use std::collections::HashMap;

mod memory;
mod rng;
mod router;
mod state;

const READER_WRITER_BUFFER_SIZE: usize = 1024 * 1024; // 1MB

#[init]
fn init(args: InitOrUpgradeArgs) {
    let InitOrUpgradeArgs::Init(args) = args else {
        panic!("Expected InitArgs, got UpgradeArgs");
    };

    let state = State::new(args.oc_public_key, args.administrator);
    rng::init(state.rng_seed());
    state::init(state);
}

#[pre_upgrade]
fn pre_upgrade() {
    let mut memory = get_upgrades_memory();
    let writer = BufferedWriter::new(READER_WRITER_BUFFER_SIZE, Writer::new(&mut memory, 0));
    let mut serializer = rmp_serde::Serializer::new(writer).with_struct_map();

    let mut state = state::take();

    // Use the current RNG to generate a new seed for the next instance
    state.set_rng_seed(rng::gen());

    state.serialize(&mut serializer).unwrap()
}

#[post_upgrade]
fn post_upgrade(args: InitOrUpgradeArgs) {
    let InitOrUpgradeArgs::Upgrade(args) = args else {
        panic!("Expected UpgradeArgs, got InitArgs");
    };

    let memory = get_upgrades_memory();
    let reader = BufferedReader::new(READER_WRITER_BUFFER_SIZE, Reader::new(&memory, 0));
    let mut deserializer = rmp_serde::Deserializer::new(reader);

    let mut state = State::deserialize(&mut deserializer).unwrap();

    state.update(args.oc_public_key, args.administrator);

    rng::init(state.rng_seed());
    state::init(state);
}

#[query]
async fn http_request(request: HttpRequest) -> HttpResponse {
    router::handle(request, true).await
}

#[update]
async fn http_request_update(request: HttpRequest) -> HttpResponse {
    router::handle(request, false).await
}

#[update]
fn insert_jokes(args: InsertJokesArgs) -> InsertJokesResponse {
    state::mutate(|state| {
        if *state.administrator() != env::caller() {
            InsertJokesResponse::NotAuthorized
        } else {
            InsertJokesResponse::Success(state.insert_jokes(args.jokes))
        }
    })
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub enum InitOrUpgradeArgs {
    Init(InitArgs),
    Upgrade(UpgradeArgs),
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct InitArgs {
    pub oc_public_key: String,
    pub administrator: Principal,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct UpgradeArgs {
    pub oc_public_key: Option<String>,
    pub administrator: Option<Principal>,
}

#[derive(CandidType, Serialize, Deserialize)]
pub struct InsertJokesArgs {
    pub jokes: HashMap<u32, String>,
}

#[derive(CandidType, Serialize, Deserialize)]
pub enum InsertJokesResponse {
    Success(u32),
    NotAuthorized,
}
