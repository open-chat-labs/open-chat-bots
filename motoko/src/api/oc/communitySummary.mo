import A "../common/accessGates";
import C "chatSummary";
import B "../common/base";
import P "../common/communityPermissions";

module {
    public type Actor = actor {
        bot_community_summary_c2c : (Args) -> async Response;
    };

    public type Args = {
        community_id : B.CommunityId;
    };

    public type Response = {
        #Success : CommunitySummary;
        #Error : (Nat16, ?Text);
    };

    public type CommunitySummary = {
        community_id: B.CommunityId;
        last_updated: B.TimestampMillis;
        name: Text;
        description: Text;
        avatar_id: ?Nat;
        banner_id: ?Nat;
        is_public: Bool;
        verified: Bool;
        member_count: Nat32;
        permissions: P.CommunityPermissions;
        public_channels: [ChannelSummary];
        rules: C.VersionedRules;
        frozen: ?C.FrozenGroupInfo;
        gate_config: ?A.AccessGateConfig;
        primary_language: Text;
        latest_event_index: B.EventIndex;
    };

    public type ChannelSummary = {
        channel_id : B.ChannelId;
        last_updated : B.TimestampMillis;
        name : Text;
    };
};
