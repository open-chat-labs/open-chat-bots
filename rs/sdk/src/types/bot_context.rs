use crate::api::command::Command;
use crate::jwt;
use crate::jwt::Claims;
use crate::types::{
    ActionContext, AutonomousScope, BotActionByCommandClaims, BotCommandScope, BotPermissions,
    CanisterId, MessageId, MessageIndex, TimestampMillis, TokenError, UserId,
};

#[derive(Clone, Debug)]
pub struct BotCommandContext {
    pub jwt: String,
    pub bot_id: UserId,
    pub api_gateway: CanisterId,
    pub command: Command,
    pub scope: BotCommandScope,
    pub granted_permissions: BotPermissions,
}

impl BotCommandContext {
    pub fn parse(jwt: String, public_key: &str, now: TimestampMillis) -> Result<Self, TokenError> {
        let claims = jwt::verify::<Claims<BotActionByCommandClaims>>(&jwt, public_key)
            .map_err(|error| TokenError::Invalid(error.to_string()))?;

        if claims.exp_ms() <= now {
            return Err(TokenError::Expired);
        }

        let claims = claims.into_custom();

        Ok(BotCommandContext {
            jwt,
            bot_id: claims.bot,
            command: claims.command,
            scope: claims.scope,
            granted_permissions: claims.granted_permissions,
            api_gateway: claims.bot_api_gateway,
        })
    }
}

impl ActionContext for BotCommandContext {
    fn api_gateway(&self) -> CanisterId {
        self.api_gateway
    }

    fn scope(&self) -> AutonomousScope {
        self.scope.clone().into()
    }

    fn message_id(&self) -> Option<MessageId> {
        if let BotCommandScope::Chat(chat) = &self.scope {
            Some(chat.message_id)
        } else {
            None
        }
    }

    fn thread(&self) -> Option<MessageIndex> {
        if let BotCommandScope::Chat(chat) = &self.scope {
            chat.thread
        } else {
            None
        }
    }

    fn jwt(&self) -> Option<String> {
        Some(self.jwt.clone())
    }
}

#[derive(Clone, Debug)]
pub struct AutonomousContext {
    pub api_gateway: CanisterId,
    pub scope: AutonomousScope,
}

impl ActionContext for AutonomousContext {
    fn api_gateway(&self) -> CanisterId {
        self.api_gateway
    }

    fn scope(&self) -> AutonomousScope {
        self.scope
    }

    fn message_id(&self) -> Option<MessageId> {
        None
    }

    fn thread(&self) -> Option<MessageIndex> {
        None
    }

    fn jwt(&self) -> Option<String> {
        None
    }
}
