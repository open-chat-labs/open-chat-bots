import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import B "../api/common/base";
import InviteUsers "../api/oc/inviteUsers";
import BotChatContext "../api/common/botChatContext";

module {
    public class Builder(context : ActionContext.ActionContext, user_ids: [B.UserId]) = this {
        var channelId : ?B.ChannelId = null;

        public func inChannel(value : ?B.ChannelId) : Builder {
            channelId := value;
            this;
        };

        public func execute() : async Result.Result<InviteUsers.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : InviteUsers.Actor;
            let ?botChatContext = BotChatContext.fromActionContext(context, channelId) else {
                return #err((#canister_error, "Invalid action context"));
            };

            try {
                let response = await botApiActor.bot_invite_users({
                    chat_context = botChatContext;
                    user_ids = user_ids;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };
};

                