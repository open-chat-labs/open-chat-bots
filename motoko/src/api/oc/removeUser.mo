import B "../common/base";
import CommunityOrGroupContext "../common/communityOrGroupContext";

module {
    type CommunityOrGroupContext = CommunityOrGroupContext.CommunityOrGroupContext;

    public type Actor = actor {
        bot_remove_user : (Args) -> async Response;
    };

    public type Args = {
        community_or_group_context : CommunityOrGroupContext;
        channel_id : ?B.ChannelId;
        user_id : B.UserId;
        block : Bool;
    };

    public type Response = B.UnitResult;
};
