use crate::rng;
use candid::Principal;
use oc_bots_sdk_canister::env;
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, collections::HashMap};

thread_local! {
    static STATE: RefCell<Option<State>> = RefCell::default();
}

#[derive(Serialize, Deserialize)]
pub struct State {
    oc_public_key: String,
    administrator: Principal,
    rng_seed: [u8; 32],
    jokes: HashMap<u32, String>,
    blobs: HashMap<u128, Blob>,
    metrics: Metrics,
}

const STATE_ALREADY_INITIALIZED: &str = "State has already been initialized";
const STATE_NOT_INITIALIZED: &str = "State has not been initialized";

pub fn init(state: State) {
    STATE.with_borrow_mut(|s| {
        if s.is_some() {
            panic!("{}", STATE_ALREADY_INITIALIZED);
        } else {
            *s = Some(state);
        }
    })
}

pub fn read<F: FnOnce(&State) -> R, R>(f: F) -> R {
    STATE.with_borrow(|s| f(s.as_ref().expect(STATE_NOT_INITIALIZED)))
}

pub fn mutate<F: FnOnce(&mut State) -> R, R>(f: F) -> R {
    STATE.with_borrow_mut(|s| f(s.as_mut().expect(STATE_NOT_INITIALIZED)))
}

pub fn take() -> State {
    STATE.take().expect(STATE_NOT_INITIALIZED)
}

impl State {
    pub fn new(oc_public_key: String, administrator: Principal) -> State {
        State {
            oc_public_key,
            administrator,
            jokes: HashMap::new(),
            blobs: HashMap::new(),
            metrics: Metrics::default(),
            // Note this is not cryptographically secure which is fine for picking a random joke.
            // To get a cryptographically secure seed use the async function:
            // `ic_cdk::api::management_canister::main::raw_rand()`
            rng_seed: env::entropy(),
        }
    }

    pub fn insert_jokes(&mut self, jokes: HashMap<u32, String>) -> u32 {
        let mut inserted = 0;
        for (k, v) in jokes {
            if self.jokes.insert(k, v).is_none() {
                inserted += 1;
            }
        }
        self.metrics.joke_count += inserted;
        inserted
    }

    pub fn update(&mut self, oc_public_key: Option<String>, administrator: Option<Principal>) {
        if let Some(oc_public_key) = oc_public_key {
            self.oc_public_key = oc_public_key;
        }

        if let Some(administrator) = administrator {
            self.administrator = administrator;
        }
    }

    pub fn set_rng_seed(&mut self, seed: [u8; 32]) {
        self.rng_seed = seed;
    }

    pub fn increment_jokes_sent(&mut self) {
        self.metrics.jokes_sent += 1;
    }

    pub fn increment_greets_sent(&mut self) {
        self.metrics.greets_sent += 1;
    }

    pub fn increment_fractals_sent(&mut self) {
        self.metrics.fractals_sent += 1;
    }

    pub fn oc_public_key(&self) -> &str {
        &self.oc_public_key
    }

    pub fn administrator(&self) -> &Principal {
        &self.administrator
    }

    pub fn rng_seed(&self) -> [u8; 32] {
        self.rng_seed
    }

    pub fn get_random_joke(&self) -> String {
        if self.jokes.is_empty() {
            return "What is the difference between a duck? One of its legs is both the same!"
                .to_string();
        }
        let index = rng::gen::<u32>() % self.jokes.len() as u32;
        self.jokes[&index].clone()
    }

    pub fn store_blob(&mut self, blob: Blob) -> u128 {
        let id = rng::gen();
        self.blobs.insert(id, blob);
        id
    }

    pub fn get_blob(&self, id: u128) -> Option<&Blob> {
        self.blobs.get(&id)
    }

    pub fn metrics(&self) -> &Metrics {
        &self.metrics
    }
}

#[derive(Serialize, Deserialize)]
pub struct Blob {
    pub mime_type: String,
    pub data: Vec<u8>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Metrics {
    pub joke_count: u32,
    pub jokes_sent: u32,
    pub echos_sent: u32,
    pub greets_sent: u32,
    pub fractals_sent: u32,
}
