import Permissions "../common/permissions";
import Scope "../common/actionScope";
import B "../common/base";

module {
    public type ActionContext = {
        botId : B.UserId;
        apiGateway : B.CanisterId;
        scope : Scope.ActionScope;
        grantedPermissions : ?Permissions.Permissions;
        authToken : B.AuthToken;
        messageId : ?B.MessageId;
        thread : ?B.MessageIndex;
    };

    public func channelId(context : ActionContext) : ?B.ChannelId {
        switch (context.scope) {
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