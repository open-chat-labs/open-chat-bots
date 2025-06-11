use oc_bots_sdk::{types::CanisterId, InstallationRegistry};
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, collections::HashSet};

thread_local! {
    static STATE: RefCell<Option<State>> = RefCell::default();
}

#[derive(Serialize, Deserialize, Default)]
pub struct State {
    banned_words_lower: HashSet<String>,
    pub installation_registry: InstallationRegistry,
    pub bot_id: Option<CanisterId>,
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
    pub fn new() -> State {
        State {
            banned_words_lower: ["cunt", "nigger"]
                .iter()
                .map(|w| w.to_ascii_lowercase())
                .collect(),
            installation_registry: InstallationRegistry::new(),
            bot_id: None,
        }
    }

    pub fn banned_words(&self) -> &HashSet<String> {
        &self.banned_words_lower
    }
}
