use crate::state;
use delete::Delete;
use list::List;
use oc_bots_sdk::api::command::BadRequest;
use oc_bots_sdk::api::command::CommandHandlerRegistry;
use oc_bots_sdk::api::command::CommandResponse;
use oc_bots_sdk::api::command::SuccessResult;
use oc_bots_sdk::api::definition::BotCommandDefinition;
use oc_bots_sdk_canister::env::now;
use oc_bots_sdk_canister::http_command_handler;
use oc_bots_sdk_canister::CanisterRuntime;
use oc_bots_sdk_canister::OPENCHAT_CLIENT_FACTORY;
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};
use remind::Remind;
use std::sync::LazyLock;

mod delete;
mod list;
mod remind;

static COMMANDS: LazyLock<CommandHandlerRegistry<CanisterRuntime>> = LazyLock::new(|| {
    CommandHandlerRegistry::new(OPENCHAT_CLIENT_FACTORY.clone())
        .register(Remind)
        .register(List)
        .register(Delete)
        .on_set_api_key(Box::new(on_set_api_key))
});

pub fn definitions() -> Vec<BotCommandDefinition> {
    COMMANDS.definitions()
}

pub async fn execute(request: HttpRequest) -> HttpResponse {
    let public_key = state::read(|state| state.oc_public_key().to_string());
    let now = now();

    http_command_handler::execute(request, &COMMANDS, &public_key, now).await
}

fn on_set_api_key(api_key: String) -> CommandResponse {
    if state::mutate(|state| state.api_key_registry.insert(api_key)) {
        CommandResponse::Success(SuccessResult { message: None })
    } else {
        CommandResponse::BadRequest(BadRequest::AccessTokenInvalid)
    }
}
