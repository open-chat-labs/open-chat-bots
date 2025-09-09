use crate::state;
use delete_rule::DeleteRule;
use list_rules::ListRules;
use oc_bots_sdk::api::command::CommandHandlerRegistry;
use oc_bots_sdk::api::definition::BotCommandDefinition;
use oc_bots_sdk_canister::CanisterRuntime;
use oc_bots_sdk_canister::OPENCHAT_CLIENT_FACTORY;
use oc_bots_sdk_canister::env::now;
use oc_bots_sdk_canister::http_command_handler;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};
use set_rule::SetRule;
use std::sync::LazyLock;

mod delete_rule;
mod list_rules;
mod set_rule;

static COMMANDS: LazyLock<CommandHandlerRegistry<CanisterRuntime>> = LazyLock::new(|| {
    CommandHandlerRegistry::new(OPENCHAT_CLIENT_FACTORY.clone())
        .register(SetRule)
        .register(ListRules)
        .register(DeleteRule)
});

pub fn definitions() -> Vec<BotCommandDefinition> {
    COMMANDS.definitions()
}

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());
    let now = now();

    http_command_handler::execute(request, &COMMANDS, &public_key, now).await
}
