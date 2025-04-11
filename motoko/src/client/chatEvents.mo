import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Error "mo:base/Error";
import ActionContext "../api/bot/actionContext";
import B "../api/common/base";
import ChatEvents "../api/oc/chatEvents";

module {
    public class Builder(context : ActionContext.ActionContext, events : ChatEvents.EventsSelectionCriteria) = this {
        var channelId : ?B.ChannelId = ActionContext.channelId(context);

        // This only takes effect for community scope
        public func withChannelId(value : ?B.ChannelId) : Builder {
            if (channelId == null) {
                channelId := value;
            };
            this;
        };

        public func execute() : async Result.Result<ChatEvents.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : ChatEvents.Actor;

            try {
                let response = await botApiActor.bot_chat_events({
                    channel_id = channelId;
                    events = events;
                    auth_token = context.authToken;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            }
        };
    };

    public type Result = Result.Result<ChatEvents.Response, Error.Error>;
}