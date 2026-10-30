use crate::types::{ChatEventType, ChatRole, CommunityEventType, InstallationLocationType};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub use crate::types::{BotPermissions, ChatPermission, CommunityPermission, MessagePermission};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BotDefinition {
    pub description: String,
    pub commands: Vec<BotCommandDefinition>,
    pub autonomous_config: Option<AutonomousConfig>,
    pub default_subscriptions: Option<BotSubscriptions>,
    pub restricted_locations: Option<HashSet<InstallationLocationType>>,
    /// The apps the bot hosts, which its MiniApp cards name: at most 100, each with a name of its
    /// own. A bot which hosts none leaves this out.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mini_apps: Vec<MiniAppDefinition>,
}

/// An app a bot hosts, as its definition declares it: a game, or another app, which OpenChat opens
/// from a MiniApp card in a frame. A card names one by its `name`, and OpenChat refuses a card whose
/// app isn't in the bot's definition. OpenChat shows the app's image in the card's frame box whenever
/// there's no app to show: before the app loads, to someone who can't open the game, and when the
/// game is over without an end state, with the result over it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct MiniAppDefinition {
    /// What a card names the app by, eg. "chess": 1 to 50 characters, unique among the bot's apps
    pub name: String,
    /// The app's artwork: an absolute https URL, or a path relative to the bot's endpoint, eg.
    /// "app/chess.svg", of at most 500 characters
    pub image_url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BotCommandDefinition {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub params: Vec<BotCommandParam>,
    pub permissions: BotPermissions,
    pub default_role: Option<ChatRole>,
    pub direct_messages: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AutonomousConfig {
    pub permissions: BotPermissions,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BotCommandParam {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub required: bool,
    pub param_type: BotCommandParamType,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum BotCommandParamType {
    BooleanParam,
    StringParam(StringParam),
    IntegerParam(IntegerParam),
    DecimalParam(DecimalParam),
    DateTimeParam(DateTimeParam),
    UserParam,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StringParam {
    pub min_length: u16,
    pub max_length: u16,
    pub choices: Vec<BotCommandOptionChoice<String>>,
    #[serde(default)]
    pub multi_line: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct IntegerParam {
    pub min_value: i64,
    pub max_value: i64,
    pub choices: Vec<BotCommandOptionChoice<i64>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DecimalParam {
    pub min_value: f64,
    pub max_value: f64,
    pub choices: Vec<BotCommandOptionChoice<f64>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BotCommandOptionChoice<T> {
    pub name: String,
    pub value: T,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DateTimeParam {
    pub future_only: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct BotSubscriptions {
    pub community: HashSet<CommunityEventType>,
    pub chat: HashSet<ChatEventType>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn definition() -> BotDefinition {
        BotDefinition {
            description: "Plays chess".to_string(),
            commands: Vec::new(),
            autonomous_config: None,
            default_subscriptions: None,
            restricted_locations: None,
            mini_apps: Vec::new(),
        }
    }

    // As `/bot_definition` serves it: in snake_case, and without `mini_apps` for a bot with none, so
    // that it reads as it did before there were any
    #[test]
    fn the_apps_are_listed_in_the_definition_only_when_there_are_some() {
        let without = serde_json::to_value(definition()).unwrap();
        assert_eq!(without.get("mini_apps"), None);
        assert!(
            serde_json::from_value::<BotDefinition>(without)
                .unwrap()
                .mini_apps
                .is_empty()
        );

        let mut with = definition();
        with.mini_apps = vec![
            MiniAppDefinition {
                name: "chess".to_string(),
                image_url: "app/chess.svg".to_string(),
            },
            MiniAppDefinition {
                name: "draughts".to_string(),
                image_url: "https://example.com/draughts.png".to_string(),
            },
        ];
        let json = serde_json::to_value(&with).unwrap();
        assert_eq!(
            json["mini_apps"],
            json!([
                { "name": "chess", "image_url": "app/chess.svg" },
                { "name": "draughts", "image_url": "https://example.com/draughts.png" },
            ])
        );
        assert_eq!(
            serde_json::from_value::<BotDefinition>(json)
                .unwrap()
                .mini_apps,
            with.mini_apps
        );
    }
}
