import S "actionScope";
import B "base";
import Chat "chat";
import InstallationLocation "installationLocation";

module {
    public type BotCommandScope = {
        #Chat : BotActionChatDetails;
        #Community : BotActionCommunityDetails;
    };

    public type BotActionChatDetails = {
        chat : Chat.Chat;
        thread : ?B.MessageIndex;
        message_id : B.MessageId;
        user_message_id : ?B.MessageId;
    };

    public type BotActionCommunityDetails = {
        community_id : B.CanisterId;
    };

    public func toActionScope(scope : BotCommandScope) : S.ActionScope {
        switch (scope) {
            case (#Chat(details)) #Chat(details.chat);
            case (#Community(details)) #Community(details.community_id);
        };
    };

    public func toLocation(scope : BotCommandScope) : InstallationLocation.InstallationLocation {
        switch (scope) {
            case (#Chat(details)) Chat.toLocation(details.chat);
            case (#Community(details)) #Community(details.community_id);
        };
    };

    public func chatDetails(scope : BotCommandScope) : ?BotActionChatDetails {
        switch (scope) {
            case (#Chat(details)) ?details;
            case (#Community(_)) null;
        };
    };

    public func messageId(scope : BotCommandScope) : ?B.MessageId {
        switch (scope) {
            case (#Chat(details)) ?details.message_id;
            case (#Community(_)) null;
        };
    };

    public func thread(scope : BotCommandScope) : ?B.MessageIndex {
        switch (scope) {
            case (#Chat(details)) details.thread;
            case (#Community(_)) null;
        };
    };

    public func communityId(scope : BotCommandScope) : ?B.CanisterId {
        switch (scope) {
            case (#Community(details)) ?details.community_id;
            case (#Chat(details)) switch (details.chat) {
                case (#Channel(communityId, _)) ?communityId;
                case _ null;
            };
        };
    };
};
