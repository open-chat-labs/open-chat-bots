use crate::state;
use oc_bots_sdk::api::{
    BotPermissions, InternalError, MessagePermission, SendMessageResponse, SlashCommandSchema,
    SuccessResult,
};
use oc_bots_sdk::types::BotCommandContext;
use oc_bots_sdk_canister::OPENCHAT_CLIENT;
use std::collections::HashSet;

pub fn execute(context: BotCommandContext) -> Result<SuccessResult, InternalError> {
    let user_id = context.initiator();
    let text = format!("hello @UserId({user_id})");

    // Send the message to OpenChat but don't wait for the response
    let message = OPENCHAT_CLIENT
        .with_command_context(context)
        .send_text_message(text)
        .execute(|args, response| match response {
            Ok(result) if matches!(result.0, SendMessageResponse::Success(_)) => {
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
        name: "greet".to_string(),
        description: Some("This will greet the caller".to_string()),
        placeholder: Some("Please wait".to_string()),
        params: vec![],
        permissions: BotPermissions {
            community: HashSet::new(),
            chat: HashSet::new(),
            message: HashSet::from_iter([MessagePermission::Text]),
        },
    }
}
