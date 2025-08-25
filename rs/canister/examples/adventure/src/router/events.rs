use oc_bots_sdk::{
    api::event_notification::{BotEvent, BotEventWrapper, BotLifecycleEvent},
    types::{Chat, InstallationLocation},
};
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
