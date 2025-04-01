import Bool "mo:base/Bool";
import Principal "mo:base/Principal";
import Option "mo:base/Option";
import Result "mo:base/Result";
import Error "mo:base/Error";
import ActionContext "../api/bot/actionContext";
import MessageContent "../api/common/messageContent";
import B "../api/common/base";
import SendMessage "../api/oc/sendMessage";
import CommandResponse "../api/bot/commandResponse";

module {
    public class Builder(context : ActionContext.ActionContext, content : MessageContent.MessageContentInitial) = this {
        var channelId : ?B.ChannelId = ActionContext.channelId(context);
        var messageId : ?B.MessageId = context.messageId();
        var blockLevelMarkdown : Bool = false;
        var finalised : Bool = false;

        // This only takes effect for community scope
        public func withChannelId(value : B.ChannelId) : Builder {
            if (channelId == null) {
                channelId := ?value;
            };
            this;
        };

        // This is only needed when using an API Key
        // If this is not set then OpenChat will generate a new message id
        public func withMessageId(value : B.MessageId) : Builder {
            if (messageId == null) {
                messageId := ?value;
            };
            this;
        };

        public func withBlockLevelMarkdown(value : Bool) : Builder {
            blockLevelMarkdown := value;
            this;
        };

        public func withFinalised(value : Bool) : Builder {
            finalised := value;
            this;
        };

        public func executeThenReturnMessage(onResponse : Result -> ()) : async ?CommandResponse.Message {
            // Only return a message if the context has a message id
            let message = Option.map(context.messageId(), func (messageId : B.MessageId) : CommandResponse.Message {
                {
                    id = messageId;
                    content = content;
                    finalised = finalised;
                    block_level_markdown = blockLevelMarkdown;
                    ephemeral = false;
                }
            });

            let botApiActor = actor (Principal.toText(context.apiGateway())) : SendMessage.Actor;

            // Ingore the send message call
            ignore try {
                let response = await botApiActor.bot_send_message({
                channel_id = channelId;
                message_id = messageId;
                content = content;
                block_level_markdown = blockLevelMarkdown;
                finalised = finalised;
                auth_token = context.authToken();
            });
                onResponse(#ok response);
            } catch (error) {
                onResponse(#err error);
            };

            return message;
        };
    };

    public type Result = Result.Result<SendMessage.Response, Error.Error>;
}