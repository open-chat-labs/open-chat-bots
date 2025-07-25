use crate::model::{start_job_if_required, CommunityStateMachine};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;

thread_local! {
    static STATE: RefCell<Option<State>> = RefCell::default();
}

#[derive(Serialize, Deserialize)]
pub struct State {
    oc_public_key: String,
    pub community_state_machine: CommunityStateMachine,
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
            community_state_machine: CommunityStateMachine::default(),
        }
    }

    pub fn update(&mut self, oc_public_key: String) {
        self.oc_public_key = oc_public_key;

        self.community_state_machine.log_state();

        start_job_if_required(self);
    }

    pub fn oc_public_key(&self) -> &str {
        &self.oc_public_key
    }
}
