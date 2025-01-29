use oc_bots_sdk::api::{
    BadRequest, BotPermissions, CommandArg, IntegerParam, MessagePermission, SlashCommandParam,
    SlashCommandParamType, SlashCommandSchema,
};
use rand::{thread_rng, Rng};
use std::collections::HashSet;

pub fn execute(args: &[CommandArg]) -> Result<String, BadRequest> {
    let mut sides = 6;
    let mut count = 1;
    for arg in args {
        if let Some(value) = arg.value.as_integer().and_then(|n| u32::try_from(n).ok()) {
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

pub fn schema() -> SlashCommandSchema {
    SlashCommandSchema {
        name: "roll".to_string(),
        description: Some("Let's roll some dice!".to_string()),
        placeholder: Some("Rolling...".to_string()),
        params: vec![
            SlashCommandParam {
                name: "sides".to_string(),
                description: Some("The number of sides on each die".to_string()),
                placeholder: Some("6".to_string()),
                required: false,
                param_type: SlashCommandParamType::IntegerParam(IntegerParam {
                    min_value: 1,
                    max_value: 1_000_000_000,
                    choices: Vec::new(),
                }),
            },
            SlashCommandParam {
                name: "count".to_string(),
                description: Some("The number of dice to roll".to_string()),
                placeholder: Some("1".to_string()),
                required: false,
                param_type: SlashCommandParamType::IntegerParam(IntegerParam {
                    min_value: 1,
                    max_value: 10,
                    choices: Vec::new(),
                }),
            },
        ],
        permissions: BotPermissions {
            message: HashSet::from_iter([MessagePermission::Text]),
            ..Default::default()
        },
    }
}
