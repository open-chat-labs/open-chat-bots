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
    /// own. A bot which hosts none leaves this empty, and it's then left out of the JSON.
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
    /// What a card names the app by, eg. "chess": 1 to 50 characters, each a lowercase ASCII
    /// letter, a digit, `-` or `_`, and unique among the bot's apps. See [`Self::is_valid_name`].
    pub name: String,
    /// The app's artwork: an absolute https URL, or a path relative to the bot's endpoint, eg.
    /// "app/chess.svg", of at most 500 characters
    pub image_url: String,
}

impl MiniAppDefinition {
    pub const MAX_NAME_CHARS: usize = 50;

    /// Whether OpenChat takes `name` as an app's name: 1 to 50 characters, each a lowercase ASCII
    /// letter, a digit, `-` or `_`, eg. "chess", "2048" or "press_counter"
    pub fn is_valid_name(name: &str) -> bool {
        !name.is_empty()
            && name.len() <= Self::MAX_NAME_CHARS
            && name
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
    }
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
    /// Shown only while an earlier param has one of the condition's values; shown always if `None`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible_when: Option<BotCommandParamCondition>,
}

/// When OpenChat's form for a command shows a param, or one of a param's choices: while an
/// earlier param, a `StringParam` with choices, has one of `values`, eg. a game's settings once
/// that game is chosen. A hidden param's arg isn't sent. An OpenChat which doesn't read conditions
/// shows every param and choice, so a bot still checks the args it's given.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BotCommandParamCondition {
    /// An earlier param's name
    pub param: String,
    /// Its values which show this param or choice
    pub values: Vec<String>,
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
    /// Shown only while an earlier param has one of the condition's values; shown always if `None`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible_when: Option<BotCommandParamCondition>,
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

    // A param, or a choice, with a condition carries it; one without is served as before conditions
    #[test]
    fn a_condition_is_served_only_when_there_is_one() {
        let when = |values: &[&str]| {
            Some(BotCommandParamCondition {
                param: "game".to_string(),
                values: values.iter().map(|v| v.to_string()).collect(),
            })
        };
        let param = BotCommandParam {
            name: "minutes".to_string(),
            description: None,
            placeholder: None,
            required: false,
            param_type: BotCommandParamType::IntegerParam(IntegerParam {
                min_value: 1,
                max_value: 60,
                choices: vec![
                    BotCommandOptionChoice {
                        name: "1 minute".to_string(),
                        value: 1,
                        visible_when: None,
                    },
                    BotCommandOptionChoice {
                        name: "An hour".to_string(),
                        value: 60,
                        visible_when: when(&["chess"]),
                    },
                ],
            }),
            visible_when: when(&["chess", "maze"]),
        };
        let json = serde_json::to_value(&param).unwrap();
        assert_eq!(
            json["visible_when"],
            json!({ "param": "game", "values": ["chess", "maze"] })
        );
        let choices = &json["param_type"]["IntegerParam"]["choices"];
        assert_eq!(choices[0], json!({ "name": "1 minute", "value": 1 }));
        assert_eq!(
            choices[1]["visible_when"],
            json!({ "param": "game", "values": ["chess"] })
        );
        let read = serde_json::from_value::<BotCommandParam>(json).unwrap();
        assert_eq!(read.visible_when, when(&["chess", "maze"]));

        let without = serde_json::to_value(BotCommandParam {
            visible_when: None,
            ..param
        })
        .unwrap();
        assert_eq!(without.get("visible_when"), None);
        assert!(
            serde_json::from_value::<BotCommandParam>(without)
                .unwrap()
                .visible_when
                .is_none()
        );
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
