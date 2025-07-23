import ActionContext "../bot/actionContext";
import B "base";
import Chat "chat";

module {
    public type BotChatContext = {
        #Command : Text;
        #Autonomous : Chat.Chat;
    };

    public func fromActionContext(context: ActionContext.ActionContext, channelId: ?B.ChannelId) : ?BotChatContext {
        switch (context.jwt) {
            case (?jwt) { return ?#Command(jwt) };
            case null {};
        };

        switch (context.scope) {
            case (#Chat(chat)) { ?#Autonomous(chat) };
            case (#Community(communityId)) {
                switch (channelId) {
                    case (?id) { ?#Autonomous(#Channel(communityId, id)) };
                    case null { null };
                };
            };
        };
    };
};