use crate::api::Command;
use crate::jwt;
use crate::jwt::Claims;
use crate::types::{
    BotActionByCommandClaims, BotActionChatDetails, BotActionScope, TimestampMillis, TokenError,
    UserId,
};
use candid::Principal;

#[derive(Debug)]
pub struct BotCommandContext {
    jwt: String,
    claims: BotActionByCommandClaims,
}

impl BotCommandContext {
    pub fn parse(jwt: String, public_key: &str, now: TimestampMillis) -> Result<Self, TokenError> {
        let claims = jwt::verify::<Claims<BotActionByCommandClaims>>(&jwt, public_key)
            .map_err(|error| TokenError::Invalid(error.to_string()))?;

        if claims.exp_ms() > now {
            Ok(BotCommandContext {
                jwt,
                claims: claims.into_custom(),
            })
        } else {
            Err(TokenError::Expired)
        }
    }

    pub fn jwt(&self) -> &str {
        &self.jwt
    }

    pub fn initiator(&self) -> UserId {
        self.claims.command.initiator
    }

    pub fn bot_id(&self) -> UserId {
        self.claims.bot
    }

    pub fn chat_scope(&self) -> Option<&BotActionChatDetails> {
        if let BotActionScope::Chat(chat) = &self.claims.scope {
            Some(chat)
        } else {
            None
        }
    }

    pub fn command(&self) -> &Command {
        &self.claims.command
    }

    pub fn bot_api_gateway(&self) -> Principal {
        self.claims.bot_api_gateway
    }
}
