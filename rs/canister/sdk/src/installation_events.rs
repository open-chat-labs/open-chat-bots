use crate::OPENCHAT_CLIENT_FACTORY;
use oc_bots_sdk::{
    oc_api::actions::{
        ActionArgsBuilder,
        installation_events::{BotInstallationEvent, Response},
    },
    types::CanisterId,
};
use std::time::Duration;

const PAGE_SIZE: u16 = 5000;

pub fn load<F: FnOnce(Vec<BotInstallationEvent>) + 'static>(
    user_index_canister_id: CanisterId,
    callback: F,
) {
    load_page(user_index_canister_id, Vec::new(), 0, callback);
}

fn load_page<F: FnOnce(Vec<BotInstallationEvent>) + 'static>(
    user_index_canister_id: CanisterId,
    installation_events: Vec<BotInstallationEvent>,
    from: u32,
    callback: F,
) {
    ic_cdk::spawn(load_inner(
        user_index_canister_id,
        installation_events,
        from,
        callback,
    ));

    async fn load_inner<F: FnOnce(Vec<BotInstallationEvent>) + 'static>(
        user_index_canister_id: CanisterId,
        mut installation_events: Vec<BotInstallationEvent>,
        from: u32,
        callback: F,
    ) {
        match OPENCHAT_CLIENT_FACTORY
            .build(user_index_canister_id)
            .installation_events()
            .from(from)
            .size(PAGE_SIZE)
            .execute_async()
            .await
        {
            Ok(Response::Success(mut result)) => {
                let count = result.events.len() as u16;

                installation_events.append(&mut result.events);

                if count == PAGE_SIZE {
                    let from = from + PAGE_SIZE as u32;
                    ic_cdk_timers::set_timer(Duration::ZERO, move || {
                        load_page(user_index_canister_id, installation_events, from, callback)
                    });
                } else {
                    callback(installation_events);
                }
            }
            error => {
                ic_cdk::println!("Failed to load installation events: {:?}", error);
            }
        }
    }
}
