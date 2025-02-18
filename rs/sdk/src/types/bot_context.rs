use super::{AuthToken, BotApiKeyToken, CanisterId, ChannelId, Chat};
use crate::api::{BotPermissions, Command};
use crate::jwt;
use crate::jwt::Claims;
use crate::types::{
    AccessTokenScope, BotActionByApiKeyClaims, BotActionByCommandClaims, BotActionScope,
    TimestampMillis, TokenError, UserId,
};
use crate::utils::base64;

#[derive(Debug)]
pub struct BotCommandContext {
    pub token: AuthToken,
    pub bot_id: UserId,
    pub api_gateway: CanisterId,
    pub command: Command,
    pub scope: BotActionScope,
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
            token: AuthToken::Jwt(jwt),
            bot_id: claims.bot,
            command: claims.command,
            scope: claims.scope,
            granted_permissions: claims.granted_permissions,
            api_gateway: claims.bot_api_gateway,
        })
    }
}

#[derive(Debug)]
pub struct BotApiKeyContext {
    pub token: AuthToken,
    pub bot_id: UserId,
    pub api_gateway: CanisterId,
    pub scope: AccessTokenScope,
    pub granted_permissions: Option<BotPermissions>,
}

impl BotApiKeyContext {
    pub fn parse(
        auth_token: AuthToken,
        public_key: &str,
        now: TimestampMillis,
    ) -> Result<Self, TokenError> {
        match auth_token {
            AuthToken::Jwt(jwt) => BotApiKeyContext::parse_jwt(jwt, public_key, now),
            AuthToken::ApiKey(api_key) => BotApiKeyContext::parse_api_key(api_key),
        }
    }

    pub fn parse_jwt(
        jwt: String,
        public_key: &str,
        now: TimestampMillis,
    ) -> Result<Self, TokenError> {
        let claims = jwt::verify::<Claims<BotActionByApiKeyClaims>>(&jwt, public_key)
            .map_err(|error| TokenError::Invalid(error.to_string()))?;

        if claims.exp_ms() <= now {
            return Err(TokenError::Expired);
        }

        let claims = claims.into_custom();

        Ok(BotApiKeyContext {
            token: AuthToken::Jwt(jwt),
            bot_id: claims.bot,
            scope: claims.scope,
            granted_permissions: Some(claims.granted_permissions),
            api_gateway: claims.bot_api_gateway,
        })
    }

    pub fn parse_api_key(api_key: String) -> Result<Self, TokenError> {
        let extracted: BotApiKeyToken =
            base64::to_value(&api_key).map_err(|error| TokenError::Invalid(error.to_string()))?;

        Ok(BotApiKeyContext {
            token: AuthToken::ApiKey(api_key),
            bot_id: extracted.bot_id,
            api_gateway: extracted.gateway,
            scope: extracted.scope,
            granted_permissions: None,
        })
    }

    pub fn channel_id(&self) -> Option<ChannelId> {
        match self.scope {
            AccessTokenScope::Chat(Chat::Channel(_, channel_id)) => Some(channel_id),
            _ => None,
        }
    }
}
