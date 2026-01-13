use crate::state;
use oc_bots_sdk::{InstallationRecord, oc_api::actions::installation_events::BotInstallationEvent};
use oc_bots_sdk_canister::installation_events;

pub fn load_installation_events() {
    let user_index_canister_id = state::read(|state| state.user_index_canister_id);

    installation_events::load(user_index_canister_id, |events| {
        ic_cdk::println!("Loaded {} events", events.len());
        state::mutate(|state| {
            for event in events {
                match event {
                    BotInstallationEvent::Installed(e) => {
                        state.installation_registry.insert(
                            e.location,
                            InstallationRecord {
                                api_gateway: e.api_gateway,
                                granted_command_permissions: e.granted_permissions,
                                granted_autonomous_permissions: e.granted_autonomous_permissions,
                                last_updated: e.timestamp,
                            },
                        );
                    }
                    BotInstallationEvent::Uninstalled(e) => {
                        state.installation_registry.remove(&e.location, e.timestamp);
                    }
                }
            }
        });
    });
}
