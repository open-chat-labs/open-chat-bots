use oc_bots_sdk::{
    api::command::{BadRequest, CommandResponse, SuccessResult},
    types::BotCommandContext,
};

use crate::state;

pub fn callback(cxt: BotCommandContext) -> CommandResponse {
    let api_key = cxt.command.arg("api_key");

    state::mutate(|state| match state.api_key_registry.insert(api_key) {
        Ok(()) => CommandResponse::Success(SuccessResult { message: None }),
        Err(err) => {
            ic_cdk::println!("API key invalid: {:?}", err);
            CommandResponse::BadRequest(BadRequest::AccessTokenInvalid(err))
        }
    })
}
