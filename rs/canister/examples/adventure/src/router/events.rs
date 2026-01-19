use oc_bots_sdk::{
    api::event_notification::{BotEvent, BotLifecycleEvent},
    types::{Chat, InstallationLocation},
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, event_parser::parse_event};

use crate::state;

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());

    let event_wrapper = match parse_event(request, &public_key) {
        Ok(wrapper) => wrapper,
        Err(err) => {
            ic_cdk::println!("Failed to parse event wrapper: {}", err);
            return HttpResponse::status(400);
        }
    };

    if let BotEvent::Lifecycle(BotLifecycleEvent::Uninstalled(event)) = event_wrapper.event {
        state::mutate(|state| {
            match event.location {
                InstallationLocation::Group(chat_id) => {
                    state.engines.remove(&Chat::Group(chat_id));
                }
                InstallationLocation::User(user_id) => {
                    state.engines.remove(&Chat::Direct(user_id));
                }
                InstallationLocation::Community(community_id) => {
                    state
                        .engines
                        .retain(|chat, _| chat.community_id() != Some(community_id));
                }
            };
        });
    }

    HttpResponse::status(200)
}
