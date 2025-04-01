import Permissions "../common/permissions";
import Scope "../common/scope";
import B "../common/base";

module {
    public type ActionContext = {
        botId : () -> B.UserId;
        apiGateway : () -> B.CanisterId;
        scope : () -> Scope.ActionScope;
        grantedPermissions : () -> ?Permissions.BotPermissions;
        messageId : () -> ?B.MessageId;
        thread : () -> ?B.MessageIndex;
        authToken : () -> B.AuthToken;
    };

    // public type ActionContext = {
    //     botId : B.UserId;
    //     apiGateway : B.CanisterId;
    //     scope : Scope.ActionScope;
    //     grantedPermissions : ?Permissions.BotPermissions;
    //     messageId : ?B.MessageId;
    //     thread : ?B.MessageIndex;
    //     authToken : B.AuthToken;
    // };

    public func channelId(context : ActionContext) : ?B.ChannelId {
        switch (context.scope()) {
            case (#Chat(chat)) {
                switch (chat) {
                    case (#Channel(_, channel_id)) {
                        ?channel_id;
                    };
                    case _ null;
                };
            };
            case _ null;            
        };
    };
}