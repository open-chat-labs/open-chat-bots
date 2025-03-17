use crate::state;
use delete::Delete;
use list::List;
use oc_bots_sdk::api::command::CommandHandlerRegistry;
use oc_bots_sdk::api::definition::BotCommandDefinition;
use oc_bots_sdk_canister::env::now;
use oc_bots_sdk_canister::http_command_handler;
use oc_bots_sdk_canister::CanisterRuntime;
use oc_bots_sdk_canister::OPENCHAT_CLIENT_FACTORY;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};
use remind_at::RemindAt;
use remind_recurring::RemindRecurring;
use std::sync::LazyLock;

mod delete;
mod list;
mod remind_at;
mod remind_recurring;
mod sync_api_key;

static COMMANDS: LazyLock<CommandHandlerRegistry<CanisterRuntime>> = LazyLock::new(|| {
    CommandHandlerRegistry::new(OPENCHAT_CLIENT_FACTORY.clone())
        .register(RemindRecurring)
        .register(RemindAt)
        .register(List)
        .register(Delete)
        .on_sync_api_key(Box::new(sync_api_key::callback))
});

pub fn definitions() -> Vec<BotCommandDefinition> {
    COMMANDS.definitions()
}

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());
    let now = now();

    http_command_handler::execute(request, &COMMANDS, &public_key, now).await
}
