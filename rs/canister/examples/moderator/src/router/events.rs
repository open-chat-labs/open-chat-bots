use lazy_static::lazy_static;
use oc_bots_sdk::api::event_notification::BotChatEvent;
use oc_bots_sdk::oc_api::actions::chat_events::{self, EventsByIndexArgs, EventsSelectionCriteria};
use oc_bots_sdk::oc_api::actions::send_message::Response;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::types::{CanisterId, UnitResult};
use oc_bots_sdk::{
    api::event_notification::{BotEvent, BotEventWrapper, BotLifecycleEvent},
    types::{ActionScope, AutonomousContext, BotPermissionsBuilder, ChatEventType, ChatPermission},
    InstallationRecord,
};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};
use regex::Regex;
use std::collections::HashSet;

use crate::state;

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let Some(event_wrapper) = serde_json::from_slice::<BotEventWrapper>(&request.body).ok() else {
        return HttpResponse::status(400);
    };

    match event_wrapper.event {
        BotEvent::Lifecycle(lifecycle_event) => {
            handle_lifecycle_event(lifecycle_event, event_wrapper.api_gateway);
        }
        BotEvent::Chat(chat_event) => {
            handle_chat_event(chat_event, event_wrapper.api_gateway).await
        }
        _ => {}
    }

    HttpResponse::status(200)
}

fn handle_lifecycle_event(lifecycle_event: BotLifecycleEvent, api_gateway: CanisterId) {
    state::mutate(|state| match lifecycle_event {
        BotLifecycleEvent::Installed(event) => {
            state.installation_registry.insert(
                event.location,
                InstallationRecord {
                    api_gateway,
                    granted_command_permissions: event.granted_command_permissions,
                    granted_autonomous_permissions: event.granted_autonomous_permissions,
                },
            );
        }
        BotLifecycleEvent::Uninstalled(event) => {
            state.installation_registry.remove(&event.location);
        }
        _ => (),
    });
}

lazy_static! {
    static ref WORDS_REGEX: Regex = Regex::new(r"\W").expect("Invalid regex");
}

async fn handle_chat_event(chat_event: BotChatEvent, api_gateway: CanisterId) {
    match chat_event.event_type {
        ChatEventType::Message | ChatEventType::MessageEdited => (),
        _ => return,
    }

    ic_cdk::println!("ChatEventType: {:?}", chat_event.event_type);

    let Some(installation) = state::read(|state| {
        state
            .installation_registry
            .get(&chat_event.chat.into())
            .cloned()
    }) else {
        return;
    };

    let required = BotPermissionsBuilder::new()
        .with_chat(ChatPermission::ReadMessages)
        .with_chat(ChatPermission::DeleteMessages)
        .build();

    if !required.is_subset(&installation.granted_autonomous_permissions) {
        return;
    }

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
            ic_cdk::println!("Failed to read message: {:?}", error);
            return;
        }
    };

    let Some((message, event_index)) = result.events.first().and_then(|event| match &event.event {
        oc_bots_sdk::types::ChatEvent::Message(message) => Some((message, event.index)),
        _ => None,
    }) else {
        ic_cdk::println!("Failed to read message");
        return;
    };

    let Some(text) = message.content.text() else {
        return;
    };

    let contains_banned_words = state::read(|state| {
        let banned_words = state.banned_words();
        let message_words = WORDS_REGEX
            .split(text)
            .map(|word| word.to_ascii_lowercase())
            .collect::<HashSet<_>>();

        message_words.intersection(banned_words).count() > 0
    });

    if contains_banned_words {
        match client
            .send_text_message("Stop using that bad language!".to_string())
            .replies_to(Some(event_index))
            .execute_async()
            .await
        {
            Ok(Response::Success(_)) => {
                // TODO: Make a note of the reported message in the state
            }
            error => {
                ic_cdk::println!("Failed to reply to message: {:?}", error);
            }
        }

        match client
            .delete_messages(vec![message.message_id])
            .with_thread(chat_event.thread)
            .execute_async()
            .await
        {
            Ok(UnitResult::Success) => {
                // TODO: Make a note of the delete message in the state
            }
            error => {
                ic_cdk::println!("Failed to delete message: {:?}", error);
            }
        }
    }
}
