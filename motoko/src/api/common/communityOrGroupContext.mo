import ActionContext "../bot/actionContext";
import B "base";

module {
    public type CommunityOrGroupContext = {
        #Command : Text;
        #Autonomous : CommunityOrGroup;
    };

    public func fromActionContext(context: ActionContext.ActionContext) : ?CommunityOrGroupContext {
        switch (context.jwt) {
            case (?jwt) { return ?#Command(jwt) };
            case null {};
        };

        switch (context.scope) {
            case (#Chat(#Direct(_))) null;
            case (#Chat(#Group(chatId))) ?#Autonomous(#Group(chatId));
            case (#Chat(#Channel(communityId, _))) ?#Autonomous(#Community(communityId));
            case (#Community(communityId)) ?#Autonomous(#Community(communityId));
        };
    };

    public type CommunityOrGroup = {
        #Community : B.CommunityId;
        #Group : B.ChatId;
    };
};