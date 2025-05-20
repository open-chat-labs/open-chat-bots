use crate::api::command::*;
use crate::api::definition::{BotCommandDefinition, BotCommandParam, BotCommandParamType};
use crate::oc_api::client::{Client, ClientFactory};
use crate::oc_api::Runtime;
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
                }
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

    for param in params.iter() {
        let Some(arg) = args.iter().find(|a| a.name == param.name) else {
            if param.required {
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
