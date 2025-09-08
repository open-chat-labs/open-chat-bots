use oc_bots_sdk::api::event_notification::{BotChatEvent, BotCommunityEvent};
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::actions::community_events::CommunityEvent;
use oc_bots_sdk::types::{CanisterId, Chat, ChatEvent, InstallationLocation, UserId};
use oc_bots_sdk::{
    api::event_notification::{BotEvent, BotLifecycleEvent},
    types::{ActionScope, AutonomousContext},
};
use oc_bots_sdk_canister::event_parser::parse_event;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};

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

    match event_wrapper.event {
        BotEvent::Lifecycle(lifecycle_event) => handle_lifecycle_event(lifecycle_event),
        BotEvent::Chat(event) => handle_chat_event(event, event_wrapper.api_gateway).await,
        BotEvent::Community(event) => {
            handle_community_event(event, event_wrapper.api_gateway).await
        }
    }

    HttpResponse::status(200)
}

fn handle_lifecycle_event(lifecycle_event: BotLifecycleEvent) {
    state::mutate(|state| {
        if let BotLifecycleEvent::Uninstalled(event) = lifecycle_event {
            match event.location {
                InstallationLocation::Community(community_id) => {
                    state.messages.remove_community(community_id);
                }
                InstallationLocation::Group(chat_id) => {
                    state.messages.remove(&Chat::Group(chat_id));
                }
                InstallationLocation::User(_user_id) => {}
            }
        }
    });
}

async fn handle_chat_event(chat_event: BotChatEvent, api_gateway: CanisterId) {
    if !matches!(chat_event.chat, Chat::Group(_)) {
        // Only handle group chat events
        return;
    }

    let event = match chat_event.event {
        ChatEvent::ParticipantJoined(event) => event,
        _ => return,
    };

    let Some(welcome_message) = state::read(|state| state.messages.get(&chat_event.chat)) else {
        return;
    };

    send_welcome_message(event.user_id, welcome_message, chat_event.chat, api_gateway).await;
}

async fn handle_community_event(community_event: BotCommunityEvent, api_gateway: CanisterId) {
    let event = match community_event.event {
        CommunityEvent::MemberJoined(event) => event,
        _ => return,
    };

    let Some((channel_id, welcome_message)) = state::read(|state| {
        state
            .messages
            .get_for_community(community_event.community_id)
    }) else {
        return;
    };

    send_welcome_message(
        event.user_id,
        welcome_message,
        Chat::Channel(
            community_event.community_id,
            event.channel_id.unwrap_or(channel_id),
        ),
        api_gateway,
    )
    .await;
}

async fn send_welcome_message(
    user_id: UserId,
    message: String,
    chat: Chat,
    api_gateway: CanisterId,
) {
    let client = OPENCHAT_CLIENT_FACTORY.build(AutonomousContext {
        scope: ActionScope::Chat(chat),
        api_gateway,
    });

    // Send a welcome message to the user
    let welcome_message = message.replace("{USERNAME}", &format!("@UserId({user_id})"));

    if let Err(error) = client
        .send_text_message(welcome_message)
        .execute_async()
        .await
    {
        ic_cdk::println!("Failed to send welcome message: {:?}", error);
    }
}
