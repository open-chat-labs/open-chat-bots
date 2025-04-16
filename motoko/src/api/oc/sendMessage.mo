import B "../common/base";
import MessageContent "../common/messageContent";

module {
    public type Actor = actor {
        bot_send_message : (Args) -> async Response;
    };

    public type Args = {
        channel_id : ?Nat32;
        message_id : ?Nat64;
        content : MessageContent.MessageContentInitial;
        block_level_markdown : Bool;
        finalised : Bool;
        auth_token : B.AuthToken;
    };

    public type Response = {
        #Success : SuccessResult;
        #FailedAuthentication : Text;
        #InvalidRequest : Text;
        #NotAuthorized;
        #Frozen;
        #ThreadNotFound;
        #MessageAlreadyFinalised;
        #C2CError : (Int32, Text);
        #Error : (Nat16, ?Text);
    };

    public type SuccessResult = {
        message_id : B.MessageId;
        event_index : B.EventIndex;
        message_index : B.MessageIndex;
        timestamp : B.TimestampMillis;
        expires_at : ?B.TimestampMillis;
    };
};
