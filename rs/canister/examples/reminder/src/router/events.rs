use crate::state;
use oc_bots_sdk::{
    api::event_notification::{BotEvent, BotEventWrapper, BotLifecycleEvent},
    InstallationRecord,
};
use oc_bots_sdk_canister::{env, HttpRequest, HttpResponse};

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());
    let now = env::now();

    let Some(event_wrapper) = BotEventWrapper::parse(&request.body, &public_key, now).ok() else {
        return HttpResponse::status(400);
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
                state.reminders.delete_from_location(&event.location);
            }
            _ => (),
        });
    }

    HttpResponse::status(200)
}
