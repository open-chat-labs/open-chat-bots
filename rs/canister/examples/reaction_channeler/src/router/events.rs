use crate::state;
use oc_bots_sdk::api::event_notification::BotChatEvent;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::types::{CanisterId, Chat, ChatEvent, InstallationLocation};
use oc_bots_sdk::{
    api::event_notification::{BotEvent, BotLifecycleEvent},
    types::{ActionScope, AutonomousContext},
};
use oc_bots_sdk_canister::event_parser::parse_event;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());

    let event_wrapper = match parse_event(request, &public_key, None) {
        Ok(wrapper) => wrapper,
        Err(err) => {
            ic_cdk::println!("Failed to parse event wrapper: {}", err);
            return HttpResponse::status(400);
        }
    };

    match event_wrapper.event {
        BotEvent::Lifecycle(lifecycle_event) => handle_lifecycle_event(lifecycle_event),
        BotEvent::Chat(event) => handle_chat_event(event, event_wrapper.api_gateway).await,
        BotEvent::Community(_) => {}
    }

    HttpResponse::status(200)
}

fn handle_lifecycle_event(lifecycle_event: BotLifecycleEvent) {
    state::mutate(|state| {
        if let BotLifecycleEvent::Uninstalled(event) = lifecycle_event
            && let InstallationLocation::Community(community_id) = event.location
        {
            state.communities.remove(&community_id);
        }
    });
}

async fn handle_chat_event(chat_event: BotChatEvent, api_gateway: CanisterId) {
    let Chat::Channel(community_id, channel_id) = chat_event.chat else {
        // Only handle community chat events
        return;
    };

    let ChatEvent::Message(message) = chat_event.event else {
        return;
    };

    let message_index = message.message_index;

    let channels = state::mutate(|state| {
        state
            .communities
            .get_mut(&community_id)
            .map(|community| community.fork_message(*message))
            .unwrap_or_default()
    });

    let oc_origin = state::read(|state| state.oc_origin().to_string());

    let message_url = format!(
        "{}/community/{}/channel/{}/{}",
        oc_origin, community_id, channel_id, message_index,
    );

    let text = format!("[{}]({})", message_url, message_url);

    for channel in channels {
        let client = OPENCHAT_CLIENT_FACTORY.build(AutonomousContext {
            scope: ActionScope::Chat(Chat::Channel(community_id, channel)),
            api_gateway,
        });

        if let Err(err) = client.send_text_message(text.clone()).execute_async().await {
            // TODO: Retry with exponential backoff
            ic_cdk::println!("Failed to copy message: {}, {:?}", message_url, err);
        }
    }
}
