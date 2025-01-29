use crate::state;
use oc_bots_sdk::api::{
    BotPermissions, InternalError, MessagePermission, SlashCommandSchema, SuccessResult,
};
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk_canister::OPENCHAT_CLIENT;
use std::collections::HashSet;

pub fn execute(context: BotCommandContext) -> Result<SuccessResult, InternalError> {
    let text = state::read(|state| state.get_random_joke());

    // Send the message to OpenChat but don't wait for the response
    let message = OPENCHAT_CLIENT
        .with_command_context(context)
        .send_text_message(text, true, |args, response| match response {
            Ok(result) if result.0.is_ok() => {
                state::mutate(|state| state.increment_jokes_sent());
            }
            error => {
                ic_cdk::println!("send_text_message: {args:?}, {error:?}");
            }
        });

    Ok(SuccessResult {
        message: Some(message),
    })
}

pub fn schema() -> SlashCommandSchema {
    SlashCommandSchema {
        name: "joke".to_string(),
        description: Some("This will send a random joke".to_string()),
        placeholder: Some("Thinking of a joke...".to_string()),
        params: vec![],
        permissions: BotPermissions {
            community: HashSet::new(),
            chat: HashSet::new(),
            message: HashSet::from_iter([MessagePermission::Text]),
        },
    }
}
