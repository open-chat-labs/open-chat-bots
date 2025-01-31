use crate::commands::{greet, joke};
use oc_bots_sdk::api::BotDefinition;

pub fn get_definition() -> BotDefinition {
    BotDefinition {
        description: "This bot can greet you and tell jokes".to_string(),
        commands: vec![greet::schema(), joke::schema()],
        autonomous_config: None,
    }
}
