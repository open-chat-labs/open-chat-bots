use async_trait::async_trait;
use std::{collections::HashMap, sync::Arc};

use crate::{
    api::{
        BadRequest, CommandArg, CommandArgValue, CommandResponse, InternalError,
        SlashCommandDefinition, SlashCommandParam, SlashCommandParamType, SuccessResult,
    },
    types::{BotCommandContext, TimestampMillis, TokenError},
    OpenChatClient,
};

pub struct CommandHandler<R> {
    commands: HashMap<String, Box<dyn Command<R>>>,
    oc_client: Arc<OpenChatClient<R>>,
}

impl<R> CommandHandler<R> {
    pub fn new(oc_client: Arc<OpenChatClient<R>>) -> CommandHandler<R> {
        Self {
            commands: HashMap::new(),
            oc_client,
        }
    }

    pub fn register(mut self, command: Box<dyn Command<R>>) -> Self {
        self.commands.insert(command.name().to_string(), command);
        self
    }

    pub fn get(&self, name: &str) -> Option<&dyn Command<R>> {
        self.commands.get(name).map(|v| &**v)
    }

    pub fn definitions(&self) -> Vec<SlashCommandDefinition> {
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
                    TokenError::Invalid(_) => {
                        CommandResponse::BadRequest(BadRequest::AccessTokenInvalid)
                    }
                    TokenError::Expired => {
                        CommandResponse::BadRequest(BadRequest::AccessTokenExpired)
                    }
                }
            }
        };

        let Some(command) = self.get(context.command().name.as_str()) else {
            return CommandResponse::BadRequest(BadRequest::CommandNotFound);
        };

        if !command.check_args(&context.command().args) {
            return CommandResponse::BadRequest(BadRequest::ArgsInvalid);
        }

        let result = command.execute(context, &self.oc_client).await;

        match result {
            Ok(success) => CommandResponse::Success(success),
            Err(error) => CommandResponse::InternalError(InternalError::CommandError(error)),
        }
    }
}

#[async_trait]
pub trait Command<R>: Send + Sync {
    fn definition(&self) -> &SlashCommandDefinition;

    async fn execute(
        &self,
        context: BotCommandContext,
        oc_client: &OpenChatClient<R>,
    ) -> Result<SuccessResult, String>;

    fn name(&self) -> &str {
        &self.definition().name
    }

    fn check_args(&self, args: &[CommandArg]) -> bool {
        check_args_internal(args, &self.definition().params)
    }
}

fn check_args_internal(args: &[CommandArg], params: &[SlashCommandParam]) -> bool {
    if args.len() > params.len() {
        return false;
    }

    for p in params.iter() {
        let Some(arg) = args.iter().find(|a| a.name == p.name) else {
            if p.required {
                return false;
            }

            continue;
        };

        match &p.param_type {
            SlashCommandParamType::StringParam(t) => {
                let Some(value) = arg.value.as_string() else {
                    return false;
                };

                if value.len() < t.min_length as usize {
                    return false;
                }

                if value.len() > t.max_length as usize {
                    return false;
                }

                if !t.choices.is_empty() && !t.choices.iter().any(|c| c.value == value) {
                    return false;
                }
            }
            SlashCommandParamType::IntegerParam(t) => {
                let Some(value) = arg.value.as_integer() else {
                    return false;
                };

                if value < t.min_value {
                    return false;
                }

                if value > t.max_value {
                    return false;
                }

                if !t.choices.is_empty() && !t.choices.iter().any(|c| c.value == value) {
                    return false;
                }
            }
            SlashCommandParamType::DecimalParam(t) => {
                let Some(value) = arg.value.as_decimal() else {
                    return false;
                };

                if value < t.min_value {
                    return false;
                }

                if value > t.max_value {
                    return false;
                }

                if !t.choices.is_empty() && !t.choices.iter().any(|c| c.value == value) {
                    return false;
                }
            }
            SlashCommandParamType::BooleanParam => {
                if !matches!(arg.value, CommandArgValue::Boolean(_)) {
                    return false;
                }
            }
            SlashCommandParamType::UserParam => {
                if !matches!(arg.value, CommandArgValue::User(_)) {
                    return false;
                }
            }
        }
    }

    true
}
