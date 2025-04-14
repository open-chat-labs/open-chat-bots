import B "../common/base";

module {
    public type Actor = actor {
        bot_delete_channel : (Args) -> async Response;
    };

    public type Args = {
        channel_id : Nat32;
        auth_token : B.AuthToken;
    };

    public type Response = {
        #Success;
        #ChannelNotFound;
        #FailedAuthentication : Text;
        #InvalidRequest : Text;
        #NotAuthorized;
        #Frozen;
        #C2CError : (Int32, Text);
    };
};
