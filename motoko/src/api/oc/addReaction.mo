import B "../common/base";
import C "../common/botChatContext";

module {
    public type Actor = actor {
        bot_add_reaction : (Args) -> async Response;
    };

    public type Args = {
        chat_context : C.BotChatContext;
        thread : ?B.MessageIndex;
        message_id : B.MessageId;
        reaction : Text;
    };

    public type Response = B.UnitResult;
};
