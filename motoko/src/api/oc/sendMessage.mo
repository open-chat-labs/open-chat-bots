import B "../common/base";
import C "../common/botChatContext";
import MessageContent "../common/messageContent";

module {
    public type Actor = actor {
        bot_send_message : (Args) -> async Response;
    };

    public type Args = {
        chat_context : C.BotChatContext;
        thread : ?B.MessageIndex;
        message_id : ?B.MessageId;
        replies_to : ?B.EventIndex;
        content : MessageContent.MessageContentInitial;
        block_level_markdown : Bool;
        finalised : Bool;
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
        #Error : B.OCError;
    };

    public type SuccessResult = {
        message_id : B.MessageId;
        event_index : B.EventIndex;
        message_index : B.MessageIndex;
        timestamp : B.TimestampMillis;
        expires_at : ?B.TimestampMillis;
    };
};
