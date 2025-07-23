import Bool "mo:base/Bool";
import Error "mo:base/Error";
import Option "mo:base/Option";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import CommandResponse "../api/bot/commandResponse";
import B "../api/common/base";
import MessageContent "../api/common/messageContent";
import SendMessage "../api/oc/sendMessage";
import BotChatContext "../api/common/botChatContext";

module {
    public class Builder(context : ActionContext.ActionContext, content : MessageContent.MessageContentInitial) = this {
        var channelId : ?B.ChannelId = null;
        var thread : ?B.MessageIndex = null;
        var messageId : ?B.MessageId = context.messageId;
        var repliesTo : ?B.EventIndex = null;
        var blockLevelMarkdown : Bool = false;
        var finalised : Bool = true;

        // This only takes effect for community scope
        public func inChannel(value : ?B.ChannelId) : Builder {
            channelId := value;
            this;
        };

        public func inThread(value : ?B.MessageIndex) : Builder {
            thread := value;
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
        
        public func inReplyTo(value : B.EventIndex) : Builder {
            repliesTo := ?value;
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

        public func executeThenReturnMessage(onResponseOpt : ?(Result -> ())) : async ?CommandResponse.Message {
            // Only return a message if the context has a message id
            let message = Option.map(context.messageId, func (messageId : B.MessageId) : CommandResponse.Message {
                {
                    id = messageId;
                    content = content;
                    finalised = finalised;
                    block_level_markdown = blockLevelMarkdown;
                    ephemeral = false;
                }
            });

            let botApiActor = actor (Principal.toText(context.apiGateway)) : SendMessage.Actor;
            let ?botChatContext = BotChatContext.fromActionContext(context, channelId) else {
                return null;
            };

            // Ingore the send message call
            ignore try {
                let response = await botApiActor.bot_send_message({
                    chat_context = botChatContext;
                    thread = thread;
                    message_id = messageId;
                    replies_to = repliesTo;
                    content = content;
                    block_level_markdown = blockLevelMarkdown;
                    finalised = finalised;
                });

                switch (onResponseOpt) {
                    case (?onResponse) onResponse(#ok response);
                    case null ();
                };
            } catch (error) {
                switch (onResponseOpt) {
                    case (?onResponse) onResponse(#err error);
                    case null ();
                };
            };

            return message;
        };

        public func execute() : async Result.Result<SendMessage.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : SendMessage.Actor;
            let ?botChatContext = BotChatContext.fromActionContext(context, channelId) else {
                return #err((#canister_error, "Invalid action context"));
            };

            try {
                let response = await botApiActor.bot_send_message({
                    chat_context = botChatContext;
                    thread = thread;
                    message_id = messageId;
                    replies_to = repliesTo;
                    content = content;
                    block_level_markdown = blockLevelMarkdown;
                    finalised = finalised;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };

    public type Result = Result.Result<SendMessage.Response, Error.Error>;
};
