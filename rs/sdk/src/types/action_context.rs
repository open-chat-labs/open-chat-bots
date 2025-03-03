use super::{
    ActionScope, AuthToken, BotApiKeyContext, BotCommandContext, BotPermissions, CanisterId,
    ChannelId, MessageId, MessageIndex,
};
use crate::api::command::Command;
use crate::types::{Chat, UserId};

pub struct ActionContext {
    token: AuthToken,
    bot_id: UserId,
    api_gateway: CanisterId,
    scope: ActionScope,
    granted_permissions: Option<BotPermissions>,
    command: Option<Command>,
    message_id: Option<MessageId>,
    thread: Option<MessageIndex>,
}

impl ActionContext {
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

    pub fn message_id(&self) -> Option<MessageId> {
        self.message_id
    }

    pub fn thread(&self) -> Option<MessageIndex> {
        self.thread
    }

    pub fn channel_id(&self) -> Option<ChannelId> {
        match self.scope {
            ActionScope::Chat(Chat::Channel(_, channel_id)) => Some(channel_id),
            _ => None,
        }
    }
}

impl From<BotCommandContext> for ActionContext {
    fn from(value: BotCommandContext) -> Self {
        let message_id = value.scope.message_id();
        let thread = value.scope.thread();

        ActionContext {
            token: value.token,
            bot_id: value.bot_id,
            api_gateway: value.api_gateway,
            scope: value.scope.into(),
            granted_permissions: Some(value.granted_permissions),
            command: Some(value.command),
            message_id,
            thread,
        }
    }
}

impl From<BotApiKeyContext> for ActionContext {
    fn from(value: BotApiKeyContext) -> Self {
        ActionContext {
            token: value.token,
            bot_id: value.bot_id,
            api_gateway: value.api_gateway,
            scope: value.scope,
            granted_permissions: Some(value.granted_permissions.into()),
            command: None,
            message_id: None,
            thread: None,
        }
    }
}
