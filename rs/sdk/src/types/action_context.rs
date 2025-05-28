use super::{
    AutonomousScope, BotChatContext, CanisterId, ChannelId, Chat, MessageId, MessageIndex,
};

pub trait ActionContext {
    fn api_gateway(&self) -> CanisterId;
    fn scope(&self) -> AutonomousScope;
    fn message_id(&self) -> Option<MessageId>;
    fn thread(&self) -> Option<MessageIndex>;
    fn jwt(&self) -> Option<String>;

    fn chat_context(&self, channel_id: Option<ChannelId>) -> Option<BotChatContext> {
        if let Some(jwt) = self.jwt() {
            return Some(BotChatContext::Command(jwt));
        }

        match self.scope() {
            AutonomousScope::Chat(chat) => Some(BotChatContext::Autonomous(chat)),
            AutonomousScope::Community(community_id) => channel_id.map(|channel_id| {
                BotChatContext::Autonomous(Chat::Channel(community_id, channel_id))
            }),
        }
    }
}
