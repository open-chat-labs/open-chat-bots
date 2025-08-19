use oc_bots_sdk::api::event_notification::{BotEvent, BotEventWrapper, BotLifecycleEvent};
use oc_bots_sdk_canister::{env, HttpRequest, HttpResponse};

use crate::state;

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());
    let now = env::now();

    let Some(event_wrapper) = BotEventWrapper::parse(&request.body, &public_key, now).ok() else {
        return HttpResponse::status(400);
    };

    if let BotEvent::Lifecycle(BotLifecycleEvent::Uninstalled(event)) = event_wrapper.event {
        state::mutate(|state| {
            state.api_key_registry.remove(&event.location);
        });
    }

    HttpResponse::status(200)
}
