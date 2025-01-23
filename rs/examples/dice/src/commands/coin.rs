use oc_bots_sdk::api::{
    BadRequest, CommandArg, MessagePermission, NumberParam, SlashCommandParam,
    SlashCommandParamType, SlashCommandPermissions, SlashCommandSchema,
};
use rand::random;
use std::collections::HashSet;
use std::str::FromStr;

pub fn execute(args: &[CommandArg]) -> Result<String, BadRequest> {
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
            param_type: SlashCommandParamType::NumberParam(NumberParam {
                min_value: 1f64,
                max_value: 10f64,
                choices: Vec::new(),
            }),
        }],
        permissions: SlashCommandPermissions {
            message: HashSet::from_iter([MessagePermission::Text]),
            ..Default::default()
        },
    }
}
