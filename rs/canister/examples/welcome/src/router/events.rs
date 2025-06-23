use oc_bots_sdk::api::event_notification::BotChatEvent;
use oc_bots_sdk::oc_api::actions::chat_events::{self, EventsByIndexArgs, EventsSelectionCriteria};
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::types::{CanisterId, ChatEvent, InstallationLocation, TextContent};
use oc_bots_sdk::{
    api::event_notification::{BotEvent, BotEventWrapper, BotLifecycleEvent},
    types::{ActionScope, AutonomousContext, ChatEventType},
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

use crate::state;

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let Some(event_wrapper) = serde_json::from_slice::<BotEventWrapper>(&request.body).ok() else {
        return HttpResponse::status(400);
    };

    handle_event(event_wrapper).await;

    HttpResponse::status(200)
}

async fn handle_event(event_wrapper: BotEventWrapper) {
    match event_wrapper.event {
        BotEvent::Lifecycle(lifecycle_event) => {
            handle_lifecycle_event(lifecycle_event, event_wrapper.api_gateway);
        }
        BotEvent::Chat(chat_event) => {
            handle_chat_event(chat_event, event_wrapper.api_gateway).await
        }
        _ => {}
    }
}

fn handle_lifecycle_event(lifecycle_event: BotLifecycleEvent, _api_gateway: CanisterId) {
    state::mutate(|state| {
        if let BotLifecycleEvent::Uninstalled(event) = lifecycle_event {
            if let InstallationLocation::Community(community_id) = event.location {
                state.messages.remove_community(community_id);
            }
        }
    });
}

async fn handle_chat_event(chat_event: BotChatEvent, api_gateway: CanisterId) {
    match chat_event.event_type {
        ChatEventType::MembersJoined => (),
        _ => return,
    }

    let Some(welcome_message) = state::read(|state| state.messages.get(&chat_event.chat).cloned())
    else {
        return;
    };

    let client = OPENCHAT_CLIENT_FACTORY.build(AutonomousContext {
        scope: ActionScope::Chat(chat_event.chat),
        api_gateway,
    });

    let result = match client
        .chat_events(EventsSelectionCriteria::ByIndex(EventsByIndexArgs {
            events: vec![chat_event.event_index],
        }))
        .with_thread(chat_event.thread)
        .execute_async()
        .await
    {
        Ok(chat_events::Response::Success(result)) => result,
        error => {
            ic_cdk::println!("Failed to read event: {:?}", error);
            return;
        }
    };

    ic_cdk::println!("Received events: {:?}", result.events);

    let Some(user_id) = result.events.first().and_then(|event| match &event.event {
        ChatEvent::ParticipantJoined(joined) => Some(joined.user_id),
        _ => None,
    }) else {
        return;
    };

    // Send a welcome message to the user
    let welcome_message = welcome_message.replace("{USERNAME}", &format!("@UserId({user_id})"));
    let message_content = oc_bots_sdk::types::MessageContentInitial::Text(TextContent {
        text: welcome_message,
    });

    if let Err(error) = client.send_message(message_content).execute_async().await {
        ic_cdk::println!("Failed to send welcome message: {:?}", error);
    }
}
