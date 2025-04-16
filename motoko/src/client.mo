import ActionContext "api/bot/actionContext";
import CommandContext "api/bot/commandContext";
import B "api/common/base";
import MessageContent "api/common/messageContent";
import ChatEventsApi "api/oc/chatEvents";
import ChatDetails "client/chatDetails";
import ChatEvents "client/chatEvents";
import CreateChannel "client/createChannel";
import DeleteChannel "client/deleteChannel";
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

        public func createChannel(name : Text, isPublic : Bool) : CreateChannel.Builder {
            CreateChannel.Builder(context, name, isPublic);
        };

        public func deleteChannel(channelId : B.ChannelId) : DeleteChannel.Builder {
            DeleteChannel.Builder(context, channelId);
        };
    };
};
