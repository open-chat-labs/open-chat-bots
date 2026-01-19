use crate::state;
use oc_bots_sdk::{
    InstallationRecord,
    api::event_notification::{BotEvent, BotLifecycleEvent},
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, event_parser::parse_event};

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());

    let event_wrapper = match parse_event(request, &public_key) {
        Ok(wrapper) => wrapper,
        Err(err) => {
            ic_cdk::println!("Failed to parse event wrapper: {}", err);
            return HttpResponse::status(400);
        }
    };

    if let BotEvent::Lifecycle(lifecycle_event) = event_wrapper.event {
        state::mutate(|state| match lifecycle_event {
            BotLifecycleEvent::Installed(event) => {
                state.installation_registry.insert(
                    event.location,
                    InstallationRecord {
                        api_gateway: event_wrapper.api_gateway,
                        granted_command_permissions: event.granted_command_permissions,
                        granted_autonomous_permissions: event.granted_autonomous_permissions,
                        last_updated: event_wrapper.timestamp,
                    },
                );
            }
            BotLifecycleEvent::Uninstalled(event) => {
                state
                    .installation_registry
                    .remove(&event.location, event_wrapper.timestamp);
                state.reminders.delete_from_location(&event.location);
            }
            _ => (),
        });
    }

    HttpResponse::status(200)
}
