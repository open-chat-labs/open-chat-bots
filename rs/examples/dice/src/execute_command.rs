use oc_bots_sdk::api::{BadRequest, CommandArg, Message};
use oc_bots_sdk::types::{BotCommandContext, TokenError};
use oc_bots_sdk::OpenChatClient;
use oc_bots_sdk_offchain::env::now;
use oc_bots_sdk_offchain::AgentRuntime;
use rand::{random, thread_rng, Rng};
use std::str::FromStr;

pub async fn execute_command(
    jwt: String,
    oc_client: &OpenChatClient<AgentRuntime>,
    oc_public_key: &str,
) -> Result<Message, BadRequest> {
    let context = match BotCommandContext::parse(jwt.to_string(), oc_public_key, now()) {
        Ok(c) => c,
        Err(bad_request) => {
            return Err(match bad_request {
                TokenError::Invalid(_) => BadRequest::AccessTokenInvalid,
                TokenError::Expired => BadRequest::AccessTokenExpired,
            });
        }
    };

    let command = context.command();
    match command.name.as_str() {
        "roll" => roll(&command.args),
        "coin" => coin(&command.args),
        _ => Err(BadRequest::CommandNotFound),
    }
    .map(|text| oc_client.send_text_message(&context, text, true, |_, _| ()))
}

fn roll(args: &[CommandArg]) -> Result<String, BadRequest> {
    let mut sides = 6;
    let mut count = 1;
    for arg in args {
        if let Some(value) = arg
            .value
            .as_number()
            .and_then(|n| u32::from_str(&n.to_string()).ok())
        {
            if value == 0 {
                return Err(BadRequest::ArgsInvalid);
            }
            match arg.name.as_str() {
                "sides" => sides = value,
                "count" => count = value,
                _ => return Err(BadRequest::ArgsInvalid),
            }
        } else {
            return Err(BadRequest::ArgsInvalid);
        }
    }

    let mut output = String::new();
    for i in 0..count {
        if i > 0 {
            output.push('\n');
        }
        let roll = thread_rng().gen_range(1..=sides);
        output.push_str(&roll.to_string());
    }
    Ok(output)
}

fn coin(args: &[CommandArg]) -> Result<String, BadRequest> {
    let mut count = 1;
    for arg in args {
        if let Some(value) = arg
            .value
            .as_number()
            .and_then(|n| u32::from_str(&n.to_string()).ok())
        {
            if value == 0 {
                return Err(BadRequest::ArgsInvalid);
            }
            match arg.name.as_str() {
                "count" => count = value,
                _ => return Err(BadRequest::ArgsInvalid),
            }
        } else {
            return Err(BadRequest::ArgsInvalid);
        }
    }

    let mut output = String::new();
    for i in 0..count {
        if i > 0 {
            output.push('\n');
        }
        let heads = random::<bool>();
        output.push_str(if heads { "heads" } else { "tails" });
    }
    Ok(output)
}
