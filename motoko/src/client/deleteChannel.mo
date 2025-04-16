import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import B "../api/common/base";
import DeleteChannel "../api/oc/deleteChannel";

module {
    public class Builder(context : ActionContext.ActionContext, channelId : B.ChannelId) = this {
        public func execute() : async Result.Result<DeleteChannel.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : DeleteChannel.Actor;

            try {
                let response = await botApiActor.bot_delete_channel({
                    channel_id = channelId;
                    auth_token = context.authToken;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };
};