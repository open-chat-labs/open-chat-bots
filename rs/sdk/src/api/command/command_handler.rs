use crate::api::command::*;
use crate::api::definition::{
    BotCommandDefinition, BotCommandOptionChoice, BotCommandParam, BotCommandParamCondition,
    BotCommandParamType,
};
use crate::oc_api::Runtime;
use crate::oc_api::client::{Client, ClientFactory};
use crate::types::{BotCommandContext, TimestampMillis, TokenError};
use async_trait::async_trait;
use std::{collections::HashMap, sync::Arc};

pub struct CommandHandlerRegistry<R> {
    commands: HashMap<String, Box<dyn CommandHandler<R>>>,
    oc_client_factory: Arc<ClientFactory<R>>,
}

impl<R: Runtime> CommandHandlerRegistry<R> {
    pub fn new(oc_client_factory: Arc<ClientFactory<R>>) -> CommandHandlerRegistry<R> {
        Self {
            commands: HashMap::new(),
            oc_client_factory,
        }
    }

    pub fn register<C: CommandHandler<R> + 'static>(mut self, command: C) -> Self {
        self.commands
            .insert(command.name().to_string(), Box::new(command));
        self
    }

    pub fn definitions(&self) -> Vec<BotCommandDefinition> {
        self.commands
            .values()
            .map(|c| c.definition().clone())
            .collect()
    }

    pub async fn execute(
        &self,
        jwt: &str,
        public_key: &str,
        now: TimestampMillis,
    ) -> CommandResponse {
        let context = match BotCommandContext::parse(jwt.to_string(), public_key, now) {
            Ok(a) => a,
            Err(bad_request) => {
                return match bad_request {
                    TokenError::Invalid(error) => {
                        CommandResponse::BadRequest(BadRequest::AccessTokenInvalid(error))
                    }
                    TokenError::Expired => {
                        CommandResponse::BadRequest(BadRequest::AccessTokenExpired)
                    }
                };
            }
        };

        let command_name = context.command.name.as_str();

        let Some(command_handler) = self.get(command_name) else {
            return CommandResponse::BadRequest(BadRequest::CommandNotFound);
        };

        if !command_handler.check_args(&context.command.args, now) {
            return CommandResponse::BadRequest(BadRequest::ArgsInvalid);
        }

        let result = command_handler
            .execute(self.oc_client_factory.build(context))
            .await;

        match result {
            Ok(success) => CommandResponse::Success(success),
            Err(error) => CommandResponse::InternalError(InternalError::CommandError(error)),
        }
    }

    fn get(&self, name: &str) -> Option<&dyn CommandHandler<R>> {
        self.commands.get(name).map(|v| &**v)
    }
}

#[async_trait]
pub trait CommandHandler<R>: Send + Sync {
    fn definition(&self) -> &BotCommandDefinition;

    async fn execute(
        &self,
        oc_client: Client<R, BotCommandContext>,
    ) -> Result<SuccessResult, String>;

    fn name(&self) -> &str {
        &self.definition().name
    }

    fn check_args(&self, args: &[CommandArg], now: TimestampMillis) -> bool {
        check_args_internal(args, &self.definition().params, now)
    }
}

fn check_args_internal(
    args: &[CommandArg],
    params: &[BotCommandParam],
    now: TimestampMillis,
) -> bool {
    if args.len() > params.len() {
        return false;
    }

    for (index, param) in params.iter().enumerate() {
        let Some(arg) = args.iter().find(|a| a.name == param.name) else {
            // OpenChat doesn't send a param its condition hides, so it's only required while shown
            if param.required && is_shown(index, params, args) {
                return false;
            }

            continue;
        };

        match &param.param_type {
            BotCommandParamType::StringParam(p) => {
                let Some(value) = arg.value.as_string() else {
                    return false;
                };

                if value.len() < p.min_length as usize {
                    return false;
                }

                if value.len() > p.max_length as usize {
                    return false;
                }

                if !p.choices.is_empty() && !p.choices.iter().any(|c| c.value == value) {
                    return false;
                }
            }
            BotCommandParamType::IntegerParam(p) => {
                let Some(value) = arg.value.as_integer() else {
                    return false;
                };

                if value < p.min_value {
                    return false;
                }

                if value > p.max_value {
                    return false;
                }

                if !p.choices.is_empty() && !p.choices.iter().any(|c| c.value == value) {
                    return false;
                }
            }
            BotCommandParamType::DecimalParam(p) => {
                let Some(value) = arg.value.as_decimal() else {
                    return false;
                };

                if value < p.min_value {
                    return false;
                }

                if value > p.max_value {
                    return false;
                }

                if !p.choices.is_empty() && !p.choices.iter().any(|c| c.value == value) {
                    return false;
                }
            }
            BotCommandParamType::BooleanParam => {
                if !matches!(arg.value, CommandArgValue::Boolean(_)) {
                    return false;
                }
            }
            BotCommandParamType::UserParam => {
                if !matches!(arg.value, CommandArgValue::User(_)) {
                    return false;
                }
            }
            BotCommandParamType::DateTimeParam(p) => {
                let Some(value) = arg.value.as_datetime() else {
                    return false;
                };

                if p.future_only && value < now {
                    return false;
                }
            }
        }
    }

    true
}

/// Whether OpenChat's form shows the param at `index`, given the args: while its condition, if it
/// has one, holds, and while one of its choices is shown, if it has choices
fn is_shown(index: usize, params: &[BotCommandParam], args: &[CommandArg]) -> bool {
    let holds =
        |condition: &BotCommandParamCondition| condition_holds(condition, index, params, args);
    let param = &params[index];
    if !param.visible_when.as_ref().is_none_or(holds) {
        return false;
    }
    match &param.param_type {
        BotCommandParamType::StringParam(p) => any_choice_shown(&p.choices, holds),
        BotCommandParamType::IntegerParam(p) => any_choice_shown(&p.choices, holds),
        BotCommandParamType::DecimalParam(p) => any_choice_shown(&p.choices, holds),
        _ => true,
    }
}

// A param without choices has none to hide
fn any_choice_shown<T>(
    choices: &[BotCommandOptionChoice<T>],
    holds: impl Fn(&BotCommandParamCondition) -> bool,
) -> bool {
    choices.is_empty()
        || choices
            .iter()
            .any(|c| c.visible_when.as_ref().is_none_or(&holds))
}

/// Whether a condition on the param at `index` holds: the earlier param it names is shown, and
/// that param's arg is one of the condition's values
fn condition_holds(
    condition: &BotCommandParamCondition,
    index: usize,
    params: &[BotCommandParam],
    args: &[CommandArg],
) -> bool {
    let Some(named) = params[..index]
        .iter()
        .position(|p| p.name == condition.param)
    else {
        return false;
    };
    is_shown(named, params, args)
        && args
            .iter()
            .find(|a| a.name == condition.param)
            .and_then(|a| a.value.as_string())
            .is_some_and(|value| condition.values.iter().any(|v| v == value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::definition::{IntegerParam, StringParam};

    fn when(values: &[&str]) -> Option<BotCommandParamCondition> {
        Some(BotCommandParamCondition {
            param: "game".to_string(),
            values: values.iter().map(|v| v.to_string()).collect(),
        })
    }

    fn param(
        name: &str,
        param_type: BotCommandParamType,
        visible_when: Option<BotCommandParamCondition>,
    ) -> BotCommandParam {
        BotCommandParam {
            name: name.to_string(),
            description: None,
            placeholder: None,
            required: true,
            param_type,
            visible_when,
        }
    }

    fn minutes(choices: Vec<(i64, Option<BotCommandParamCondition>)>) -> BotCommandParamType {
        BotCommandParamType::IntegerParam(IntegerParam {
            min_value: 1,
            max_value: 60,
            choices: choices
                .into_iter()
                .map(|(value, visible_when)| BotCommandOptionChoice {
                    name: value.to_string(),
                    value,
                    visible_when,
                })
                .collect(),
        })
    }

    fn params(increment: BotCommandParam) -> Vec<BotCommandParam> {
        let game = BotCommandParamType::StringParam(StringParam {
            min_length: 1,
            max_length: 10,
            choices: ["chess", "maze"]
                .map(|v| BotCommandOptionChoice {
                    name: v.to_string(),
                    value: v.to_string(),
                    visible_when: None,
                })
                .into(),
            multi_line: false,
        });
        vec![param("game", game, None), increment]
    }

    fn args(game: &str, increment: Option<i64>) -> Vec<CommandArg> {
        let mut args = vec![CommandArg {
            name: "game".to_string(),
            value: CommandArgValue::String(game.to_string()),
        }];
        if let Some(increment) = increment {
            args.push(CommandArg {
                name: "increment".to_string(),
                value: CommandArgValue::Integer(increment),
            });
        }
        args
    }

    #[test]
    fn a_required_param_is_required_only_while_its_condition_holds() {
        let params = params(param("increment", minutes(Vec::new()), when(&["chess"])));
        assert!(check_args_internal(&args("chess", Some(5)), &params, 0));
        assert!(!check_args_internal(&args("chess", None), &params, 0));
        // hidden for the maze, so OpenChat doesn't send it
        assert!(check_args_internal(&args("maze", None), &params, 0));
    }

    #[test]
    fn a_required_param_none_of_whose_choices_is_shown_is_hidden() {
        let params = params(param(
            "increment",
            minutes(vec![(60, when(&["chess"]))]),
            None,
        ));
        assert!(!check_args_internal(&args("chess", None), &params, 0));
        assert!(check_args_internal(&args("maze", None), &params, 0));
        // a choice without a condition is always shown
        let params = self::params(param(
            "increment",
            minutes(vec![(1, None), (60, when(&["chess"]))]),
            None,
        ));
        assert!(!check_args_internal(&args("maze", None), &params, 0));
    }
}
