use oc_bots_sdk::api::{
    BadRequest, BotPermissions, CommandArg, IntegerParam, MessagePermission, SlashCommandParam,
    SlashCommandParamType, SlashCommandSchema,
};
use rand::random;
use std::collections::HashSet;

pub fn execute(args: &[CommandArg]) -> Result<String, BadRequest> {
    let mut count = 1;
    for arg in args {
        if let Some(value) = arg.value.as_integer().and_then(|n| u32::try_from(n).ok()) {
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

pub fn schema() -> SlashCommandSchema {
    SlashCommandSchema {
        name: "coin".to_string(),
        description: Some("Let's toss some coins!".to_string()),
        placeholder: Some("Tossing...".to_string()),
        params: vec![SlashCommandParam {
            name: "count".to_string(),
            description: Some("The number of coins to toss".to_string()),
            placeholder: Some("1".to_string()),
            required: false,
            param_type: SlashCommandParamType::IntegerParam(IntegerParam {
                min_value: 1,
                max_value: 10,
                choices: Vec::new(),
            }),
        }],
        permissions: BotPermissions {
            message: HashSet::from_iter([MessagePermission::Text]),
            ..Default::default()
        },
    }
}
