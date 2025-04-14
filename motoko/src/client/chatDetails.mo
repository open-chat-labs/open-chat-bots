import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import B "../api/common/base";
import ChatDetails "../api/oc/chatDetails";

module {
    public class Builder(context : ActionContext.ActionContext) = this {
        var channelId : ?B.ChannelId = ActionContext.channelId(context);

        // This only takes effect for community scope
        public func withChannelId(value : ?B.ChannelId) : Builder {
            if (channelId == null) {
                channelId := value;
            };
            this;
        };

        public func execute() : async Result.Result<ChatDetails.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : ChatDetails.Actor;

            try {
                let response = await botApiActor.bot_chat_details({
                    channel_id = channelId;
                    auth_token = context.authToken;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };

    public type Result = Result.Result<ChatDetails.Response, Error.Error>;
};
