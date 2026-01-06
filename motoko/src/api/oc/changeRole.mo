import B "../common/base";
import C "../common/botChatContext";
import R "../common/chatRole";

module {
    public type Actor = actor {
        bot_change_role : (Args) -> async Response;
    };

    public type Args = {
        chat_context : C.BotChatContext;
        user_ids : [B.UserId];
        new_role : R.ChatRole;
    };

    public type Response = {
        #Success;
        #PartialSuccess : [(B.UserId, B.OCError)];
        #Error : B.OCError;
    };
};
