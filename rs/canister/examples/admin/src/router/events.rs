use crate::model::start_job_if_required;
use crate::state;
use oc_bots_sdk::api::event_notification::{BotEvent, BotEventWrapper, BotLifecycleEvent};
use oc_bots_sdk::types::InstallationLocation;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let Some(event_wrapper) = serde_json::from_slice::<BotEventWrapper>(&request.body).ok() else {
        return HttpResponse::status(400);
    };

    handle_event(event_wrapper).await;

    HttpResponse::status(200)
}

async fn handle_event(event_wrapper: BotEventWrapper) {
    state::mutate(|state| match event_wrapper.event {
        BotEvent::Lifecycle(BotLifecycleEvent::Installed(event)) => {
            if let InstallationLocation::Community(community_id) = event.location {
                state
                    .community_state_machine
                    .add_community(community_id, event_wrapper.api_gateway);
                start_job_if_required(state);
            }
        }
        BotEvent::Lifecycle(BotLifecycleEvent::Uninstalled(event)) => {
            if let InstallationLocation::Community(community_id) = event.location {
                state.community_state_machine.remove_community(community_id);
                start_job_if_required(state);
            }
        }
        BotEvent::Community(community_event) => {
            state.community_state_machine.handle_event(
                community_event.community_id,
                event_wrapper.timestamp,
                community_event.event_index,
                community_event.event,
            );
            start_job_if_required(state);
        }
        _ => {}
    });
}
