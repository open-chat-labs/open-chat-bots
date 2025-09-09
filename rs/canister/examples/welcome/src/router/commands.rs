use crate::state;
use clear_welcome_message::ClearWelcomeMessage;
use oc_bots_sdk::api::command::CommandHandlerRegistry;
use oc_bots_sdk::api::definition::BotCommandDefinition;
use oc_bots_sdk_canister::CanisterRuntime;
use oc_bots_sdk_canister::OPENCHAT_CLIENT_FACTORY;
use oc_bots_sdk_canister::env::now;
use oc_bots_sdk_canister::http_command_handler;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};
use read_welcome_message::ReadWelcomeMessage;
use set_welcome_message::SetWelcomeMessage;
use std::sync::LazyLock;

mod clear_welcome_message;
mod read_welcome_message;
mod set_welcome_message;

static COMMANDS: LazyLock<CommandHandlerRegistry<CanisterRuntime>> = LazyLock::new(|| {
    CommandHandlerRegistry::new(OPENCHAT_CLIENT_FACTORY.clone())
        .register(SetWelcomeMessage)
        .register(ReadWelcomeMessage)
        .register(ClearWelcomeMessage)
});

pub fn definitions() -> Vec<BotCommandDefinition> {
    COMMANDS.definitions()
}

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());
    let now = now();

    http_command_handler::execute(request, &COMMANDS, &public_key, now).await
}
