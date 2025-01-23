use oc_bots_sdk::api::{
    BadRequest, CommandArg, MessagePermission, NumberParam, SlashCommandParam,
    SlashCommandParamType, SlashCommandPermissions, SlashCommandSchema,
};
use rand::{thread_rng, Rng};
use std::collections::HashSet;
use std::str::FromStr;

pub fn execute(args: &[CommandArg]) -> Result<String, BadRequest> {
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
                param_type: SlashCommandParamType::NumberParam(NumberParam {
                    min_value: 1f64,
                    max_value: u32::MAX.into(),
                    choices: Vec::new(),
                }),
            },
            SlashCommandParam {
                name: "count".to_string(),
                description: Some("The number of dice to roll".to_string()),
                placeholder: Some("1".to_string()),
                required: false,
                param_type: SlashCommandParamType::NumberParam(NumberParam {
                    min_value: 1f64,
                    max_value: 10f64,
                    choices: Vec::new(),
                }),
            },
        ],
        permissions: SlashCommandPermissions {
            message: HashSet::from_iter([MessagePermission::Text]),
            ..Default::default()
        },
    }
}
