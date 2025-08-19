use candid::CandidType;
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use ic_http_certification::{HttpRequest, HttpResponse};
use ic_stable_structures::{
    reader::{BufferedReader, Reader},
    writer::{BufferedWriter, Writer},
};
use memory::get_upgrades_memory;
use serde::{Deserialize, Serialize};
use state::State;

pub mod memory;
pub mod router;
pub mod state;

const READER_WRITER_BUFFER_SIZE: usize = 1024 * 1024; // 1MB

#[init]
fn init(args: InitOrUpgradeArgs) {
    let state = State::new(args.oc_public_key);
    state::init(state);
}

#[pre_upgrade]
fn pre_upgrade() {
    let mut memory = get_upgrades_memory();
    let writer = BufferedWriter::new(READER_WRITER_BUFFER_SIZE, Writer::new(&mut memory, 0));
    let mut serializer = rmp_serde::Serializer::new(writer).with_struct_map();

    let state = state::take();
    state.serialize(&mut serializer).unwrap()
}

#[post_upgrade]
fn post_upgrade(args: InitOrUpgradeArgs) {
    let memory = get_upgrades_memory();
    let reader = BufferedReader::new(READER_WRITER_BUFFER_SIZE, Reader::new(&memory, 0));
    let mut deserializer = rmp_serde::Deserializer::new(reader);

    let mut state = State::deserialize(&mut deserializer).unwrap();

    state.update(args.oc_public_key);

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

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct InitOrUpgradeArgs {
    pub oc_public_key: String,
}
