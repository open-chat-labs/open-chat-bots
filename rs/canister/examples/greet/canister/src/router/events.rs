use oc_bots_sdk::api::event_notification::{BotEvent, BotEventWrapper, BotLifecycleEvent};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};

use crate::state;

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let Some(event_wrapper) = serde_json::from_slice::<BotEventWrapper>(&request.body).ok() else {
        return HttpResponse::status(400);
    };

    if let BotEvent::Lifecycle(BotLifecycleEvent::Uninstalled(event)) = event_wrapper.event {
        state::mutate(|state| {
            state.api_key_registry.remove(&event.location);
        });
    }

    HttpResponse::status(200)
}
