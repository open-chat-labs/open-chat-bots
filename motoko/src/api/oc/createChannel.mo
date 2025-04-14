import A "../common/accessGates";
import B "../common/base";
import P "../common/chatPermissions";

module {
    public type Actor = actor {
        bot_create_channel : (Args) -> async Response;
    };

    public type Args = {
        is_public : Bool;
        name : Text;
        description : Text;
        rules : Rules;
        avatar : ?Document;
        history_visible_to_new_joiners : Bool;
        messages_visible_to_non_members : Bool;
        permissions : ?P.ChatPermissions;
        events_ttl : ?B.Milliseconds;
        gate_config : ?A.AccessGateConfig;
        external_url : ?Text;
        auth_token : B.AuthToken;
    };

    public type Rules = {
        text : Text;
        enabled : Bool;
    };

    public type Document = {
        id : Nat;
        mime_type : Text;
        data : [Nat8];
    };

    public type Response = {
        #Success : SuccessResult;
        #FailedAuthentication : Text;
        #InvalidRequest : Text;
        #NotAuthorized;
        #Frozen;
        #C2CError : (Int32, Text);
    };

    public type SuccessResult = {
        channel_id : B.ChannelId;
    };
};
