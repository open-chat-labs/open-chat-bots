import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import BotChatContext "../api/common/botChatContext";
import B "../api/common/base";
import ChatSummary "../api/oc/chatSummary";

module {
    public class Builder(context : ActionContext.ActionContext) = this {
        var channelId : ?B.ChannelId = null;

        // This only takes effect for community scope
        public func inChannel(value : ?B.ChannelId) : Builder {
            channelId := value;
            this;
        };

        public func execute() : async Result.Result<ChatSummary.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : ChatSummary.Actor;
            let ?botChatContext = BotChatContext.fromActionContext(context, channelId) else {
                return #err((#canister_error, "Invalid action context"));
            };

            try {
                let response = await botApiActor.bot_chat_summary_c2c({
                    chat_context = botChatContext;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };

    public type Result = Result.Result<ChatSummary.Response, Error.Error>;
};
