import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import CommunityEvents "../api/oc/communityEvents";
import ActionScope "../api/common/actionScope";

module {
    public class Builder(context : ActionContext.ActionContext, events : CommunityEvents.EventsSelectionCriteria) = this {

        public func execute() : async Result.Result<CommunityEvents.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : CommunityEvents.Actor;
            let ?communityId = ActionScope.communityId(context.scope) else {
                return #err((#canister_error, "Invalid action context"));
            };

            try {
                let response = await botApiActor.bot_community_events_c2c({
                    community_id = communityId;
                    events = events;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };

    public type Result = Result.Result<CommunityEvents.Response, Error.Error>;
};
