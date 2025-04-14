import ActionContext "api/bot/actionContext";
import CommandContext "api/bot/commandContext";
import MessageContent "api/common/messageContent";
import ChatEventsApi "api/oc/chatEvents";
import ChatDetails "client/chatDetails";
import ChatEvents "client/chatEvents";
import SendMessage "client/sendMessage";

module {
    public class CommandClient(commandContext : CommandContext.CommandContext) {
        public let context = commandContext;

        let actionContext : ActionContext.ActionContext = CommandContext.toActionContext(context);

        public func sendMessage(content : MessageContent.MessageContentInitial) : SendMessage.Builder {
            SendMessage.Builder(actionContext, content);
        };

        public func sendTextMessage(text : Text) : SendMessage.Builder {
            sendMessage(#Text { text = text });
        };

        public func chatDetails() : ChatDetails.Builder {
            ChatDetails.Builder(actionContext);
        };

        public func chatEvents(events : ChatEventsApi.EventsSelectionCriteria) : ChatEvents.Builder {
            ChatEvents.Builder(actionContext, events);
        };
    };

    public class AutonomousClient(context : ActionContext.ActionContext) {
        public func sendMessage(content : MessageContent.MessageContentInitial) : SendMessage.Builder {
            SendMessage.Builder(context, content);
        };

        public func sendTextMessage(text : Text) : SendMessage.Builder {
            sendMessage(#Text { text = text });
        };

        public func chatDetails() : ChatDetails.Builder {
            ChatDetails.Builder(context);
        };

        public func chatEvents(events : ChatEventsApi.EventsSelectionCriteria) : ChatEvents.Builder {
            ChatEvents.Builder(context, events);
        };
    };
};
