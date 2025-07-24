import B "../common/base";

module {
    public type Actor = actor {
        bot_delete_channel : (Args) -> async Response;
    };

    public type Args = {
        community_id : B.CanisterId;
        channel_id : B.ChannelId;
    };

    public type Response = B.UnitResult;
};
