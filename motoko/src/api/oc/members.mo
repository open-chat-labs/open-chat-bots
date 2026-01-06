import B "../common/base";
import MemberType "../common/memberType";
import CommunityOrGroupContext "../common/communityOrGroupContext";

module {
    type CommunityOrGroupContext = CommunityOrGroupContext.CommunityOrGroupContext;
    type MemberType = MemberType.MemberType;

    public type Actor = actor {
        bot_members_c2c : (Args) -> async Response;
    };

    public type Args = {
        community_or_group_context : CommunityOrGroupContext;
        channel_id : ?B.ChannelId;
        member_types : [MemberType];
    };

    public type Response = {
        #Success : MembersResult;
        #Error : B.OCError;
    };

    public type MembersResult = {
        members_map : [(MemberType, [B.UserId])];
        timestamp : B.TimestampMillis;
    };
};
