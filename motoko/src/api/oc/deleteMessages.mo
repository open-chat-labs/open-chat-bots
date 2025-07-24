import B "../common/base";
import C "../common/botChatContext";

module {
    public type Actor = actor {
        bot_delete_messages : (Args) -> async Response;
    };

    public type Args = {
        chat_context : C.BotChatContext;
        thread : ?B.MessageIndex;
        message_ids : [B.MessageId];
    };

    public type Response = B.UnitResult;
};
