use crate::api::command::*;
use crate::api::definition::{
    BotCommandDefinition, BotCommandParam, BotCommandParamType, StringParam,
};
use crate::oc_api::client_factory::ClientFactory;
use crate::types::{BotCommandContext, TimestampMillis, TokenError};
use async_trait::async_trait;
use std::str::FromStr;
use std::sync::LazyLock;
use std::{collections::HashMap, sync::Arc};

pub struct CommandHandlerRegistry<R> {
    commands: HashMap<String, Box<dyn CommandHandler<R>>>,
    on_sync_api_key:
        Option<Box<dyn Fn(BotCommandContext) -> CommandResponse + Send + Sync + 'static>>,
    on_direct_message: Option<Box<dyn CommandHandler<R>>>,
    oc_client_factory: Arc<ClientFactory<R>>,
}

static SET_API_KEY_PARAMS: LazyLock<Vec<BotCommandParam>> = LazyLock::new(set_api_key_params);
static DIRECT_MESSAGE_PARAMS: LazyLock<Vec<BotCommandParam>> = LazyLock::new(direct_message_params);

impl<R> CommandHandlerRegistry<R> {
    pub fn new(oc_client_factory: Arc<ClientFactory<R>>) -> CommandHandlerRegistry<R> {
        Self {
            commands: HashMap::new(),
            on_sync_api_key: None,
            on_direct_message: None,
            oc_client_factory,
        }
    }

    pub fn register<C: CommandHandler<R> + 'static>(mut self, command: C) -> Self {
        self.commands
            .insert(command.name().to_string(), Box::new(command));
        self
    }

    pub fn on_sync_api_key(
        mut self,
        callback: Box<dyn Fn(BotCommandContext) -> CommandResponse + Send + Sync + 'static>,
    ) -> Self {
        self.on_sync_api_key = Some(callback);
        self
    }

    pub fn on_direct_message<C: CommandHandler<R> + 'static>(mut self, command: C) -> Self {
        self.on_direct_message = Some(Box::new(command));
        self
    }

    pub fn get(&self, name: &str) -> Option<&dyn CommandHandler<R>> {
        self.commands.get(name).map(|v| &**v)
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

        if command_name == "sync_api_key" {
            if let Some(on_sync_api_key) = &self.on_sync_api_key {
                if !check_args_internal(&context.command.args, &SET_API_KEY_PARAMS, now) {
                    return CommandResponse::BadRequest(BadRequest::ArgsInvalid);
                }

                return on_sync_api_key(context);
            } else {
                return CommandResponse::BadRequest(BadRequest::CommandNotFound);
            }
        }

        let command_handler = if command_name == "direct_message" {
            let Some(on_direct_messge) = self.on_direct_message.as_ref() else {
                return CommandResponse::BadRequest(BadRequest::CommandNotFound);
            };

            if !check_args_internal(&context.command.args, &DIRECT_MESSAGE_PARAMS, now) {
                return CommandResponse::BadRequest(BadRequest::ArgsInvalid);
            }

            if u64::from_str(&context.command.arg::<String>("initiator_message_id")).is_err() {
                return CommandResponse::BadRequest(BadRequest::ArgsInvalid);
            }

            &**on_direct_messge
        } else {
            let Some(command_handler) = self.get(command_name) else {
                return CommandResponse::BadRequest(BadRequest::CommandNotFound);
            };

            if !command_handler.check_args(&context.command.args, now) {
                return CommandResponse::BadRequest(BadRequest::ArgsInvalid);
            }

            command_handler
        };

        let result = command_handler
            .execute(context, &self.oc_client_factory)
            .await;

        match result {
            Ok(success) => CommandResponse::Success(success),
            Err(error) => CommandResponse::InternalError(InternalError::CommandError(error)),
        }
    }
}

#[async_trait]
pub trait CommandHandler<R>: Send + Sync {
    fn definition(&self) -> &BotCommandDefinition;

    async fn execute(
        &self,
        context: BotCommandContext,
        oc_client_factory: &ClientFactory<R>,
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

    for p in params.iter() {
        let Some(arg) = args.iter().find(|a| a.name == p.name) else {
            if p.required {
                return false;
            }

            continue;
        };

        match &p.param_type {
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

fn set_api_key_params() -> Vec<BotCommandParam> {
    vec![BotCommandParam {
        name: "api_key".to_string(),
        description: None,
        placeholder: None,
        required: true,
        param_type: BotCommandParamType::StringParam(StringParam {
            min_length: 10,
            max_length: 1000,
            choices: vec![],
            multi_line: false,
        }),
    }]
}

fn direct_message_params() -> Vec<BotCommandParam> {
    vec![
        BotCommandParam {
            name: "message".to_string(),
            description: None,
            placeholder: None,
            required: true,
            param_type: BotCommandParamType::StringParam(StringParam {
                min_length: 1,
                max_length: 10000,
                choices: vec![],
                multi_line: false,
            }),
        },
        BotCommandParam {
            name: "initiator_message_id".to_string(),
            description: None,
            placeholder: None,
            required: true,
            param_type: BotCommandParamType::StringParam(StringParam {
                min_length: 1,
                max_length: 20,
                choices: vec![],
                multi_line: false,
            }),
        },
    ]
}
