import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import B "../api/common/base";
import AddReaction "../api/oc/addReaction";
import BotChatContext "../api/common/botChatContext";

module {
    public class Builder(context : ActionContext.ActionContext, messageId: B.MessageId, reaction : Text) = this {
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

        public func execute() : async Result.Result<AddReaction.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : AddReaction.Actor;
            let ?botChatContext = BotChatContext.fromActionContext(context, channelId) else {
                return #err((#canister_error, "Invalid action context"));
            };

            try {
                let response = await botApiActor.bot_add_reaction({
                    chat_context = botChatContext;
                    thread = thread;
                    message_id = messageId;
                    reaction = reaction;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };
};
