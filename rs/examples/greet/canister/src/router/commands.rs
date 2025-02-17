mod fractal;
mod greet;
mod joke;

use crate::state;
use fractal::Fractal;
use greet::Greet;
use joke::Joke;
use oc_bots_sdk::api::CommandResponse;
use oc_bots_sdk::api::SlashCommandDefinition;
use oc_bots_sdk::CommandHandler;
use oc_bots_sdk_canister::env::now;
use oc_bots_sdk_canister::CanisterRuntime;
use oc_bots_sdk_canister::OPENCHAT_CLIENT;
use oc_bots_sdk_canister::{Request, Response};
use std::str;
use std::sync::LazyLock;

static COMMANDS: LazyLock<CommandHandler<CanisterRuntime>> = LazyLock::new(|| {
    CommandHandler::new(OPENCHAT_CLIENT.clone())
        .register(Greet)
        .register(Joke)
        .register(Fractal)
});

pub fn definitions() -> Vec<SlashCommandDefinition> {
    COMMANDS.definitions()
}

pub async fn execute(request: Request) -> Response {
    let jwt = match str::from_utf8(&request.body) {
        Ok(jwt) => jwt,
        Err(error) => return Response::text(400, format!("Invalid access token: {:?}", error)),
    };

    let public_key = state::read(|state| state.oc_public_key().to_string());

    let now = now();

    match COMMANDS.execute(jwt, &public_key, now).await {
        CommandResponse::Success(r) => Response::json(200, &r),
        CommandResponse::BadRequest(r) => Response::json(400, &r),
        CommandResponse::InternalError(r) => Response::json(500, &r),
    }
}
