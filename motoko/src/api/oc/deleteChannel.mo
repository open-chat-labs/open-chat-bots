import B "../common/base";

module {
    public type Actor = actor {
        bot_delete_channel : (Args) -> async Response;
    };

    public type Args = {
        community_id : B.CanisterId;
        channel_id : B.ChannelId;
    };

    public type Response = {
        #Success;
        #ChannelNotFound;
        #FailedAuthentication : Text;
        #InvalidRequest : Text;
        #NotAuthorized;
        #Frozen;
        #C2CError : (Int32, Text);
        #Error : (Nat16, ?Text);
    };
};
