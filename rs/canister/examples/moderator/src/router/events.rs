use lazy_static::lazy_static;
use oc_bots_sdk::api::event_notification::BotChatEvent;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::actions::send_message::Response;
use oc_bots_sdk::types::{CanisterId, ChatEvent, MessagePermission, UnitResult};
use oc_bots_sdk::{
    InstallationRecord,
    api::event_notification::{BotEvent, BotEventWrapper, BotLifecycleEvent},
    types::{ActionScope, AutonomousContext, BotPermissionsBuilder, ChatPermission},
};
use oc_bots_sdk_canister::event_parser::parse_event;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse, OPENCHAT_CLIENT_FACTORY};
use regex::Regex;
use std::collections::HashSet;

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

    handle_event(event_wrapper).await;

    HttpResponse::status(200)
}

async fn handle_event(event_wrapper: BotEventWrapper) {
    match event_wrapper.event {
        BotEvent::Lifecycle(lifecycle_event) => {
            handle_lifecycle_event(lifecycle_event, event_wrapper.api_gateway);
        }
        BotEvent::Chat(chat_event) => {
            let Some(bot_id) = state::read(|state| state.bot_id) else {
                ic_cdk::println!("Bot registration not captured");
                return;
            };

            // Ignore chat events initiated by the bot itself
            if chat_event.event.initiated_by() != Some(bot_id) {
                handle_chat_event(chat_event, event_wrapper.api_gateway).await
            }
        }
        _ => {}
    }
}

fn handle_lifecycle_event(lifecycle_event: BotLifecycleEvent, api_gateway: CanisterId) {
    state::mutate(|state| match lifecycle_event {
        BotLifecycleEvent::Registered(event) => {
            ic_cdk::println!("Bot registered: {:?}", event);
            state.bot_id = Some(event.bot_id);
        }
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
    });
}

lazy_static! {
    static ref WORDS_REGEX: Regex = Regex::new(r"\W").expect("Invalid regex");
}

async fn handle_chat_event(chat_event: BotChatEvent, api_gateway: CanisterId) {
    let ChatEvent::Message(message) = chat_event.event else {
        return;
    };

    let Some(text) = message.content.text() else {
        return;
    };

    let Some(installation) = state::read(|state| {
        state
            .installation_registry
            .get(&chat_event.chat.into())
            .cloned()
    }) else {
        ic_cdk::println!("Bot not installed in this chat: {:?}", chat_event.chat);
        return;
    };

    let required = BotPermissionsBuilder::new()
        .with_message(MessagePermission::Text)
        .with_chat(ChatPermission::DeleteMessages)
        .build();

    if !required.is_subset(&installation.granted_autonomous_permissions) {
        ic_cdk::println!("Not permitted to delete and send messages");
        return;
    }

    let contains_banned_words = state::read(|state| {
        let banned_words = state.banned_words();
        let message_words = WORDS_REGEX
            .split(text)
            .map(|word| word.to_ascii_lowercase())
            .collect::<HashSet<_>>();

        message_words.intersection(banned_words).count() > 0
    });

    if contains_banned_words {
        let client = OPENCHAT_CLIENT_FACTORY.build(AutonomousContext {
            scope: ActionScope::Chat(chat_event.chat),
            api_gateway,
        });

        match client
            .send_text_message("Stop using bad language!".to_string())
            .in_thread(chat_event.thread)
            .replies_to(Some(chat_event.event_index))
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
                // TODO: Make a note of the deleted message in the state
            }
            error => {
                ic_cdk::println!("Failed to delete message: {:?}", error);
            }
        }
    }
}
