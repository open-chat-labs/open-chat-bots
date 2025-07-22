import Scope "../common/actionScope";
import B "../common/base";

module {
    public type ActionContext = {
        apiGateway : B.CanisterId;
        scope : Scope.ActionScope;
        messageId : ?B.MessageId;
        thread : ?B.MessageIndex;
        jwt : ?Text; // Optional JWT for command contexts
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
};
