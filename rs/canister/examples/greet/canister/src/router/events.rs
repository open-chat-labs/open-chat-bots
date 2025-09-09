use oc_bots_sdk::api::event_notification::{BotEvent, BotLifecycleEvent};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, event_parser::parse_event};

use crate::state;

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());

    let event_wrapper = match parse_event(request, &public_key, None) {
        Ok(wrapper) => wrapper,
        Err(err) => {
            ic_cdk::println!("Failed to parse event wrapper: {}", err);
            return HttpResponse::status(400);
        }
    };

    if let BotEvent::Lifecycle(BotLifecycleEvent::Uninstalled(event)) = event_wrapper.event {
        state::mutate(|state| {
            state.api_key_registry.remove(&event.location);
        });
    }

    HttpResponse::status(200)
}
