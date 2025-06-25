use super::{ActionScope, CanisterId, MessageId, MessageIndex};

pub trait ActionContext {
    fn api_gateway(&self) -> CanisterId;
    fn scope(&self) -> ActionScope;
    fn message_id(&self) -> Option<MessageId>;
    fn thread(&self) -> Option<MessageIndex>;
    fn jwt(&self) -> Option<String>;
}
