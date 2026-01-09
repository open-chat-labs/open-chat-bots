import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import ActionContext "../api/bot/actionContext";
import B "../api/common/base";
import R "../api/common/chatRole";
import ChangeRole "../api/oc/changeRole";
import BotChatContext "../api/common/botChatContext";

module {
    public class Builder(context : ActionContext.ActionContext, userIds : [B.UserId], newRole : R.ChatRole) = this {
        var channelId : ?B.ChannelId = null;

        // This only takes effect for community scope
        public func inChannel(value : ?B.ChannelId) : Builder {
            channelId := value;
            this;
        };

        public func execute() : async Result.Result<ChangeRole.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : ChangeRole.Actor;
            let ?botChatContext = BotChatContext.fromActionContext(context, channelId) else {
                return #err((#canister_error, "Invalid action context"));
            };

            try {
                let response = await botApiActor.bot_change_role({
                    chat_context = botChatContext;
                    user_ids = userIds;
                    new_role = newRole;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };
};
