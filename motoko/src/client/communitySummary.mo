import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import ActionScope "../api/common/actionScope";
import CommunitySummary "../api/oc/communitySummary";

module {
    public class Builder(context : ActionContext.ActionContext) = this {
        public func execute() : async Result.Result<CommunitySummary.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : CommunitySummary.Actor;
            let ?communityId = ActionScope.communityId(context.scope) else {
                return #err((#canister_error, "Invalid action context"));
            };

            try {
                let response = await botApiActor.bot_community_summary_c2c({
                    community_id = communityId;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };

    public type Result = Result.Result<CommunitySummary.Response, Error.Error>;
};
