import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import ActionScope "../api/common/actionScope";
import B "../api/common/base";
import SubscribeToEvents "../api/oc/subscribeToEvents";

module {
    public class Builder(context : ActionContext.ActionContext) = this {
        var channelId : ?B.ChannelId = null;

        public func inChannel(value : B.ChannelId) : Builder {
            channelId := ?value;
            this;
        };

        public func execute() : async Result.Result<SubscribeToEvents.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : SubscribeToEvents.Actor;
            let scope = switch (channelId) {
                case (?id) ActionScope.withChannelId(context.scope, id);
                case null context.scope;
            };

            try {
                let response = await botApiActor.bot_subscribe_to_events({
                    scope = scope;
                    community_events = [];
                    chat_events = [];
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };
};
