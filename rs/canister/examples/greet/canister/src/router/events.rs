use oc_bots_sdk::{
    api::event_notification::{BotEvent, BotEventWrapper, BotLifecycleEvent},
    InstallationRecord,
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};

use crate::state;

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let event_wrapper = match serde_json::from_slice::<BotEventWrapper>(&request.body) {
        Ok(result) => result,
        Err(error) => {
            ic_cdk::println!(
                "Failed to parse event: {:?}, error: {:?}",
                request.body,
                error
            );
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
                    },
                );
            }
            BotLifecycleEvent::Uninstalled(event) => {
                state.installation_registry.remove(&event.location);
                state.installation_secrets.remove(&event.location);
            }
            _ => (),
        });
    }

    HttpResponse::status(200)
}
