use crate::{
    installations::load_installation_events,
    model::reminders::{self, Reminders},
};
use ic_principal::Principal;
use oc_bots_sdk::{InstallationRegistry, types::CanisterId};
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, time::Duration};

thread_local! {
    static STATE: RefCell<Option<State>> = RefCell::default();
}

#[derive(Serialize, Deserialize)]
pub struct State {
    oc_public_key: String,
    #[serde(default = "prod_user_index_canister_id")]
    pub user_index_canister_id: CanisterId,
    pub installation_registry: InstallationRegistry,
    pub reminders: Reminders,
}

fn prod_user_index_canister_id() -> CanisterId {
    Principal::from_text("4bkt6-4aaaa-aaaaf-aaaiq-cai")
        .unwrap()
        .into()
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
    pub fn new(oc_public_key: String, user_index_canister_id: Option<CanisterId>) -> State {
        State {
            oc_public_key,
            user_index_canister_id: user_index_canister_id
                .unwrap_or_else(prod_user_index_canister_id),
            installation_registry: InstallationRegistry::new(),
            reminders: Reminders::default(),
        }
    }

    pub fn update(
        &mut self,
        oc_public_key: Option<String>,
        user_index_canister_id: Option<CanisterId>,
    ) {
        if let Some(oc_public_key) = oc_public_key {
            self.oc_public_key = oc_public_key;
        }

        if let Some(user_index_canister_id) = user_index_canister_id {
            self.user_index_canister_id = user_index_canister_id;
        }

        ic_cdk_timers::set_timer(Duration::ZERO, load_installation_events);
        reminders::start_job_if_required(self);
    }

    pub fn oc_public_key(&self) -> &str {
        &self.oc_public_key
    }

    pub fn metrics(&self) -> Metrics {
        Metrics {
            installations: self.installation_registry.count(),
            reminders: self.reminders.count(),
            chats_with_reminders: self.reminders.chats_count(),
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
pub struct Metrics {
    pub installations: usize,
    pub reminders: usize,
    pub chats_with_reminders: usize,
}
