use crate::commands::{fractal, greet, joke};
use oc_bots_sdk::api::BotDefinition;

pub fn get_definition() -> BotDefinition {
    BotDefinition {
        description: "This bot can greet you, tell jokes, and generate fractal images!".to_string(),
        commands: vec![greet::schema(), joke::schema(), fractal::schema()],
        autonomous_config: None,
    }
}
