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
        // OpenChat treats `null` and `?[]` identically (it does `og_previews.unwrap_or_default()`),
        // so for this pass-through SDK the two are equivalent in effect - neither results in any
        // previews. The distinction only means something in the offchain SDKs, where `null` is
        // what lets them fetch previews automatically.
        og_previews : ?[MessageContent.OgPreview];
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
