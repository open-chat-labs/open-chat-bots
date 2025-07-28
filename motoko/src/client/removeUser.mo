import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Bool "mo:base/Bool";

import ActionContext "../api/bot/actionContext";
import B "../api/common/base";
import RemoveUser "../api/oc/removeUser";
import CommunityOrGroupContext "../api/common/communityOrGroupContext";

module {
    public class Builder(context : ActionContext.ActionContext, userId: B.UserId) = this {
        var channelId : ?B.ChannelId = null;
        var block : Bool = false;

        public func fromChannel(value : B.ChannelId) : Builder {
            channelId := ?value;
            this;
        };

        public func andBlock() : Builder {
            block := true;
            this;
        };

        public func execute() : async Result.Result<RemoveUser.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : RemoveUser.Actor;
            let ?communityOrGroupContext = CommunityOrGroupContext.fromActionContext(context) else {
                return #err((#canister_error, "Invalid action context"));
            };

            try {
                let response = await botApiActor.bot_remove_user({
                    community_or_group_context = communityOrGroupContext;
                    channel_id = channelId;
                    user_id = userId;
                    block = block;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };
};
