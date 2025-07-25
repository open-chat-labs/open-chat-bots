import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import B "../api/common/base";
import DeleteMessages "../api/oc/deleteMessages";
import BotChatContext "../api/common/botChatContext";

module {
    public class Builder(context : ActionContext.ActionContext, messageIds: [B.MessageId]) = this {
        var channelId : ?B.ChannelId = null;
        var thread : ?B.MessageIndex = null;

        // This only takes effect for community scope
        public func inChannel(value : ?B.ChannelId) : Builder {
            channelId := value;
            this;
        };

        public func inThread(value : ?B.MessageIndex) : Builder {
            thread := value;
            this;
        };

        public func execute() : async Result.Result<DeleteMessages.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : DeleteMessages.Actor;
            let ?botChatContext = BotChatContext.fromActionContext(context, channelId) else {
                return #err((#canister_error, "Invalid action context"));
            };

            try {
                let response = await botApiActor.bot_delete_messages({
                    chat_context = botChatContext;
                    message_ids = messageIds;
                    thread = thread;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };
};
