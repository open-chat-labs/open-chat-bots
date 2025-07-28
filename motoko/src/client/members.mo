import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import B "../api/common/base";
import Members "../api/oc/members";
import CommunityOrGroupContext "../api/common/communityOrGroupContext";

module {
    public class Builder(context : ActionContext.ActionContext, memberTypes: [Members.MemberType]) = this {
        var channelId : ?B.ChannelId = null;

        public func inChannel(value : ?B.ChannelId) : Builder {
            channelId := value;
            this;
        };

        public func execute() : async Result.Result<Members.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : Members.Actor;
            let ?communityOrGroupContext = CommunityOrGroupContext.fromActionContext(context) else {
                return #err((#canister_error, "Invalid action context"));
            };

            try {
                let response = await botApiActor.bot_members_c2c({
                    community_or_group_context = communityOrGroupContext;
                    channel_id = channelId;
                    member_types = memberTypes;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };

    public type Result = Result.Result<Members.Response, Error.Error>;
};
