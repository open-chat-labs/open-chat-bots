import CommandContext "api/bot/commandContext";
import MessageContent "api/common/messageContent";
import SendMessage "client/sendMessage";
import ActionContext "api/bot/actionContext";

module {
    public class CommandClient(commandContext : CommandContext.CommandContext) {
        public let context = commandContext;

        let actionContext : ActionContext.ActionContext = CommandContext.toActionContext(context);

        public func sendMessage(content: MessageContent.MessageContentInitial) : SendMessage.Builder {
            SendMessage.Builder(actionContext, content);
        };

        public func sendTextMessage(text : Text) : SendMessage.Builder {
            sendMessage(#Text { text = text });
        };

    // pub fn chat_details(&self) -> ChatDetailsBuilder<R, C> {
    //     ChatDetailsBuilder::new(self)
    // }

    // pub fn chat_events(&self, events: EventsSelectionCriteria) -> ChatEventsBuilder<R, C> {
    //     ChatEventsBuilder::new(self, events)
    // }
    };

    public class AutonomousClient(context : ActionContext.ActionContext) {
        public func sendMessage(content: MessageContent.MessageContentInitial) : SendMessage.Builder {
            SendMessage.Builder(context, content);
        };

        public func sendTextMessage(text : Text) : SendMessage.Builder {
            sendMessage(#Text { text = text });
        };

    // pub fn chat_details(&self) -> ChatDetailsBuilder<R, C> {
    //     ChatDetailsBuilder::new(self)
    // }

    // pub fn chat_events(&self, events: EventsSelectionCriteria) -> ChatEventsBuilder<R, C> {
    //     ChatEventsBuilder::new(self, events)
    // }
    }
}