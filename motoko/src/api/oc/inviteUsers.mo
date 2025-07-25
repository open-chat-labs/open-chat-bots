import B "../common/base";
import C "../common/botChatContext";

module {
    public type Actor = actor {
        bot_invite_users : (Args) -> async Response;
    };

    public type Args = {
        chat_context : C.BotChatContext;
        user_ids : [B.UserId];
    };

    public type Response = B.UnitResult;
};
