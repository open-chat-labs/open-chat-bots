import ActionScope "../common/actionScope";
import B "../common/base";
import E "../common/eventTypes";

module {
    type ActionScope = ActionScope.ActionScope;

    public type Actor = actor {
        bot_subscribe_to_events : (Args) -> async Response;
    };

    public type Args = {
        scope : ActionScope;
        community_events : [E.CommunityEventType];
        chat_events : [E.ChatEventType];
    };

    public type Response = B.UnitResult;
};
