import ActionContext "api/bot/actionContext";
import MessageContent "api/common/messageContent";
import SendMessage "client/sendMessage";
import Text "mo:base/Text";

module {
    public class Client<T <: ActionContext.ActionContext>(_context : T) = this {
        public let context : T = _context;

        public func sendMessage(content: MessageContent.MessageContentInitial) : SendMessage.Builder {
            SendMessage.Builder(context, content);
        };

        public func sendTextMessage(text : Text) : SendMessage.Builder {
            sendMessage(#Text { text = text });
        };

    // pub fn create_channel(&self, name: String, is_public: bool) -> CreateChannelBuilder<R, C> {
    //     CreateChannelBuilder::new(self, name, is_public)
    // }

    // pub fn delete_channel(&self, channel_id: ChannelId) -> DeleteChannelBuilder<R, C> {
    //     DeleteChannelBuilder::new(self, channel_id)
    // }

    // pub fn chat_details(&self) -> ChatDetailsBuilder<R, C> {
    //     ChatDetailsBuilder::new(self)
    // }

    // pub fn chat_events(&self, events: EventsSelectionCriteria) -> ChatEventsBuilder<R, C> {
    //     ChatEventsBuilder::new(self, events)
    // }


    };
}