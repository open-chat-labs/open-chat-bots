use super::{
    ActionScope, AuthToken, BotPermissions, CanisterId, ChannelId, MessageId, MessageIndex,
};
use crate::types::{Chat, UserId};

pub trait ActionContext {
    fn bot_id(&self) -> UserId;
    fn api_gateway(&self) -> CanisterId;
    fn scope(&self) -> ActionScope;
    fn granted_permissions(&self) -> Option<&BotPermissions>;
    fn message_id(&self) -> Option<MessageId>;
    fn thread(&self) -> Option<MessageIndex>;
    fn auth_token(&self) -> &AuthToken;

    fn channel_id(&self) -> Option<ChannelId> {
        match self.scope() {
            ActionScope::Chat(Chat::Channel(_, channel_id)) => Some(channel_id),
            _ => None,
        }
    }
}
