use super::{
    AccessTokenScope, AuthToken, BotActionScope, BotApiKeyToken, CanisterId, MessageId,
    MessageIndex,
};
use crate::api::{BotPermissions, Command};
use crate::jwt;
use crate::jwt::Claims;
use crate::types::{
    BotActionByApiKeyClaims, BotActionByCommandClaims, Chat, TimestampMillis, TokenError, UserId,
};
use crate::utils::base64;

pub struct ActionContext {
    token: AuthToken,
    bot_id: UserId,
    api_gateway: CanisterId,
    scope: ActionScope,
    granted_permissions: Option<BotPermissions>,
    command: Option<Command>,
}

impl ActionContext {
    pub fn parse_command_jwt(
        token: String,
        public_key: &str,
        now: TimestampMillis,
    ) -> Result<Self, TokenError> {
        let claims = jwt::verify::<Claims<BotActionByCommandClaims>>(&token, public_key)
            .map_err(|error| TokenError::Invalid(error.to_string()))?;

        if claims.exp_ms() <= now {
            return Err(TokenError::Expired);
        }

        let claims = claims.into_custom();

        Ok(ActionContext {
            token: AuthToken::Jwt(token),
            bot_id: claims.bot,
            api_gateway: claims.bot_api_gateway,
            scope: claims.scope.into(),
            granted_permissions: Some(claims.granted_permissions),
            command: Some(claims.command),
        })
    }

    pub fn parse_api_key_jwt(
        token: String,
        public_key: &str,
        now: TimestampMillis,
    ) -> Result<Self, TokenError> {
        let claims = jwt::verify::<Claims<BotActionByApiKeyClaims>>(&token, public_key)
            .map_err(|error| TokenError::Invalid(error.to_string()))?;

        if claims.exp_ms() <= now {
            return Err(TokenError::Expired);
        }

        let claims = claims.into_custom();

        Ok(ActionContext {
            token: AuthToken::Jwt(token),
            bot_id: claims.bot,
            api_gateway: claims.bot_api_gateway,
            scope: claims.scope.into(),
            granted_permissions: Some(claims.granted_permissions),
            command: None,
        })
    }

    pub fn parse_api_key(token: String) -> Result<Self, TokenError> {
        let claims: BotApiKeyToken =
            base64::to_value(&token).map_err(|error| TokenError::Invalid(error.to_string()))?;

        Ok(ActionContext {
            token: AuthToken::ApiKey(token),
            bot_id: claims.bot_id,
            api_gateway: claims.gateway,
            scope: claims.scope.into(),
            granted_permissions: None,
            command: None,
        })
    }

    pub fn into_token(self) -> AuthToken {
        self.token
    }

    pub fn bot_id(&self) -> UserId {
        self.bot_id
    }

    pub fn api_gateway(&self) -> CanisterId {
        self.api_gateway
    }

    pub fn scope(&self) -> &ActionScope {
        &self.scope
    }

    pub fn granted_permissions(&self) -> Option<&BotPermissions> {
        self.granted_permissions.as_ref()
    }

    pub fn command(&self) -> Option<&Command> {
        self.command.as_ref()
    }
}

pub enum ActionScope {
    Chat(ChatScope),
    Community(CommunityScope),
}

impl ActionScope {
    pub fn message_id(&self) -> Option<MessageId> {
        match self {
            ActionScope::Chat(chat) => chat.message_id,
            ActionScope::Community(_) => None,
        }
    }
}

pub struct ChatScope {
    pub chat: Chat,
    pub thread: Option<MessageIndex>,
    pub message_id: Option<MessageId>,
}

pub struct CommunityScope {
    pub community: CanisterId,
}

impl From<BotActionScope> for ActionScope {
    fn from(value: BotActionScope) -> Self {
        match value {
            BotActionScope::Chat(chat) => ActionScope::Chat(ChatScope {
                chat: chat.chat,
                thread: chat.thread_root_message_index,
                message_id: Some(chat.message_id),
            }),
            BotActionScope::Community(community) => ActionScope::Community(CommunityScope {
                community: community.community_id,
            }),
        }
    }
}

impl From<AccessTokenScope> for ActionScope {
    fn from(value: AccessTokenScope) -> Self {
        match value {
            AccessTokenScope::Chat(chat) => ActionScope::Chat(ChatScope {
                chat,
                thread: None,
                message_id: None,
            }),
            AccessTokenScope::Community(community) => {
                ActionScope::Community(CommunityScope { community })
            }
        }
    }
}
