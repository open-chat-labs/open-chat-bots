use crate::model::reminders::{self, Reminders};
use oc_bots_sdk::ApiKeyRegistry;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;

thread_local! {
    static STATE: RefCell<Option<State>> = RefCell::default();
}

#[derive(Serialize, Deserialize)]
pub struct State {
    oc_public_key: String,
    pub api_key_registry: ApiKeyRegistry,
    pub reminders: Reminders,
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
    pub fn new(oc_public_key: String) -> State {
        State {
            oc_public_key,
            api_key_registry: ApiKeyRegistry::default(),
            reminders: Reminders::default(),
        }
    }

    pub fn update(&mut self, oc_public_key: Option<String>) {
        if let Some(oc_public_key) = oc_public_key {
            self.oc_public_key = oc_public_key;
        }

        reminders::start_job_if_required(self);
    }

    pub fn oc_public_key(&self) -> &str {
        &self.oc_public_key
    }

    pub fn metrics(&self) -> Metrics {
        Metrics {
            api_keys: self.api_key_registry.count(),
            reminders: self.reminders.count(),
            chats_with_reminders: self.reminders.chats_count(),
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
pub struct Metrics {
    pub api_keys: usize,
    pub reminders: usize,
    pub chats_with_reminders: usize,
}
