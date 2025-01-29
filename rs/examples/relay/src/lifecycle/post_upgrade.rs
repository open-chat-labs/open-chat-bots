use crate::lifecycle::READER_WRITER_BUFFER_SIZE;
use crate::memory::get_upgrades_memory;
use crate::state;
use crate::state::State;
use ic_cdk::post_upgrade;
use ic_stable_structures::reader::{BufferedReader, Reader};
use serde::Deserialize;

use super::init::InitOrUpgradeArgs;

#[post_upgrade]
fn post_upgrade(_args: InitOrUpgradeArgs) {
    let memory = get_upgrades_memory();
    let reader = BufferedReader::new(READER_WRITER_BUFFER_SIZE, Reader::new(&memory, 0));
    let mut deserializer = rmp_serde::Deserializer::new(reader);

    let state = State::deserialize(&mut deserializer).unwrap();

    state::init(state);
}
