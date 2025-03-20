use crate::api::command::Command;
use crate::jwt;
use crate::jwt::Claims;
use crate::types::{
    ActionContext, ActionScope, AuthToken, BotActionByApiKeyClaims, BotActionByCommandClaims,
    BotApiKeyToken, BotCommandScope, BotPermissions, CanisterId, ChannelId, Chat, MessageId,
    MessageIndex, TimestampMillis, TokenError, UserId,
};
use crate::utils::base64;

#[derive(Clone, Debug)]
pub struct BotCommandContext {
    pub token: AuthToken,
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
            token: AuthToken::Jwt(jwt),
            bot_id: claims.bot,
            command: claims.command,
            scope: claims.scope,
            granted_permissions: claims.granted_permissions,
            api_gateway: claims.bot_api_gateway,
        })
    }
}

impl ActionContext for BotCommandContext {
    fn bot_id(&self) -> UserId {
        self.bot_id
    }

    fn api_gateway(&self) -> CanisterId {
        self.api_gateway
    }

    fn scope(&self) -> ActionScope {
        self.scope.clone().into()
    }

    fn granted_permissions(&self) -> Option<&BotPermissions> {
        Some(&self.granted_permissions)
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

    fn auth_token(&self) -> &AuthToken {
        &self.token
    }
}

#[derive(Debug)]
pub struct BotApiKeyContext {
    pub token: AuthToken,
    pub bot_id: UserId,
    pub api_gateway: CanisterId,
    pub scope: ActionScope,
    pub granted_permissions: BotPermissions,
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
            granted_permissions: claims.granted_permissions,
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
            granted_permissions: extracted.permissions,
        })
    }

    pub fn channel_id(&self) -> Option<ChannelId> {
        match self.scope {
            ActionScope::Chat(Chat::Channel(_, channel_id)) => Some(channel_id),
            _ => None,
        }
    }
}

impl ActionContext for BotApiKeyContext {
    fn bot_id(&self) -> UserId {
        self.bot_id
    }

    fn api_gateway(&self) -> CanisterId {
        self.api_gateway
    }

    fn scope(&self) -> ActionScope {
        self.scope
    }

    fn granted_permissions(&self) -> Option<&BotPermissions> {
        Some(&self.granted_permissions)
    }

    fn message_id(&self) -> Option<MessageId> {
        None
    }

    fn thread(&self) -> Option<MessageIndex> {
        None
    }

    fn auth_token(&self) -> &AuthToken {
        &self.token
    }
}

#[cfg(test)]
mod tests {
    use candid::Principal;

    use super::*;

    #[test]
    fn test_parse_api_key() {
        let api_key = "eyJnYXRld2F5IjoiYnI1ZjctN3VhYWEtYWFhYWEtcWFhY2EtY2FpIiwiYm90X2lkIjoicGh4dWstbnJleHQtcnAzM2QtcXBhdXEiLCJzY29wZSI6eyJDaGF0Ijp7Ikdyb3VwIjoiZHpoMjItbnVhYWEtYWFhYWEtcWFhb2EtY2FpIn19LCJzZWNyZXQiOiIyNTM0NTEyNjIzNDQwMTA2MDIwMzU3NzczNzYyNjU1MjU5MDgzODAiLCJwZXJtaXNzaW9ucyI6eyJtZXNzYWdlIjoxfX0=".to_string();

        let cxt = match BotApiKeyContext::parse_api_key(api_key) {
            Ok(cxt) => cxt,
            Err(error) => {
                panic!("Failed to parse api key: {:?}", error);
            }
        };

        assert_eq!(
            cxt.bot_id,
            Principal::from_text("phxuk-nrext-rp33d-qpauq")
                .unwrap()
                .into()
        );

        let granted: BotPermissions = cxt.granted_permissions;

        assert!(granted.is_subset(&BotPermissions::text_only()));
    }
}
