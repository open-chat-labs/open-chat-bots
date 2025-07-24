import Json "mo:json";
module Events {
    public type ChatEventCategory = {
        #Message;    // Messages + edits; reaction; tips; etc.
        #Membership; // User added; blocked; invited; role changed; etc.
        #Details;    // Name; description; rules; permissions changed; etc.
    };

    public type ChatEventType = {
        // Message category
        #Message;
        #MessageEdited;
        #MessageReaction;
        #MessageTipped;
        #MessageDeleted;
        #MessageUndeleted;
        #MessagePollVote;
        #MessagePollEnded;
        #MessagePrizeClaim;
        #MessageP2pSwapCompleted;
        #MessageP2pSwapCancelled;
        #MessageVideoCall;

        // Details category
        #NameChanged;
        #DescriptionChanged;
        #RulesChanged;
        #AvatarChanged;
        #ExternalUrlUpdated;
        #PermissionsChanged;
        #GateUpdated;
        #VisibilityChanged;
        #Frozen;   // Applies to group chats only
        #Unfrozen; // Applies to group chats only
        #DisappearingMessagesUpdated;
        #MessagePinned;
        #MessageUnpinned;

        // Membership category
        #MembersJoined;
        #MembersLeft;
        #RoleChanged;
        #UsersInvited;
        #UsersBlocked;
        #UsersUnblocked;
    };

    public type CommunityEventCategory = {
        #Membership; // User added; blocked; invited; role changed; etc.
        #Details;    // Name; description; rules; permissions changed; etc.
    };

    public type CommunityEventType = {
        // Details category
        #Created;
        #NameChanged;
        #DescriptionChanged;
        #RulesChanged;
        #AvatarChanged;
        #BannerChanged;
        #PermissionsChanged;
        #VisibilityChanged;
        #Frozen;
        #Unfrozen;
        #GateUpdated;
        #MessagePinned;
        #MessageUnpinned;
        #PrimaryLanguageChanged;
        #GroupImported;
        #ChannelCreated;
        #ChannelDeleted;

        // Membership category
        #MemberJoined;
        #MemberLeft;
        #MembersRemoved;
        #RoleChanged;
        #UsersInvited;
        #BotAdded;
        #BotRemoved;
        #BotUpdated;
        #UsersBlocked;
        #UsersUnblocked;
    };

    public func serializeChatEventType(event_type : ChatEventType) : Json.Json {
        Ser.serializeChatEventType(event_type);
    };

    public func serializeCommunityEventType(event_type : CommunityEventType) : Json.Json {
        Ser.serializeCommunityEventType(event_type);
    };

    module Ser {
        public func serializeCommunityEventType(event_type : CommunityEventType) : Json.Json {
            switch (event_type) {
                case (#Created) #string("Created");
                case (#NameChanged) #string("NameChanged");
                case (#DescriptionChanged) #string("DescriptionChanged");
                case (#RulesChanged) #string("RulesChanged");
                case (#AvatarChanged) #string("AvatarChanged");
                case (#BannerChanged) #string("BannerChanged");
                case (#PermissionsChanged) #string("PermissionsChanged");
                case (#VisibilityChanged) #string("VisibilityChanged");
                case (#Frozen) #string("Frozen");
                case (#Unfrozen) #string("Unfrozen");
                case (#GateUpdated) #string("GateUpdated");
                case (#MessagePinned) #string("MessagePinned");
                case (#MessageUnpinned) #string("MessageUnpinned");
                case (#PrimaryLanguageChanged) #string("PrimaryLanguageChanged");
                case (#GroupImported) #string("GroupImported");
                case (#ChannelCreated) #string("ChannelCreated");
                case (#ChannelDeleted) #string("ChannelDeleted");

                // Membership category
                case (#MemberJoined) #string("MemberJoined");
                case (#MemberLeft) #string("MemberLeft");
                case (#MembersRemoved) #string("MembersRemoved");
                case (#RoleChanged) #string("RoleChanged");
                case (#UsersInvited) #string("UsersInvited");
                case (#BotAdded) #string("BotAdded");
                case (#BotRemoved) #string("BotRemoved");
                case (#BotUpdated) #string("BotUpdated");
                case (#UsersBlocked) #string("UsersBlocked");
                case (#UsersUnblocked) #string("UsersUnblocked");
            };
        };

        public func serializeChatEventType(event_type : ChatEventType) : Json.Json {
            switch (event_type) {
                // Message category
                case (#Message) #string("Message");
                case (#MessageEdited) #string("MessageEdited");
                case (#MessageReaction) #string("MessageReaction");
                case (#MessageTipped) #string("MessageTipped");
                case (#MessageDeleted) #string("MessageDeleted");
                case (#MessageUndeleted) #string("MessageUndeleted");
                case (#MessagePollVote) #string("MessagePollVote");
                case (#MessagePollEnded) #string("MessagePollEnded");
                case (#MessagePrizeClaim) #string("MessagePrizeClaim");
                case (#MessageP2pSwapCompleted) #string("MessageP2pSwapCompleted");
                case (#MessageP2pSwapCancelled) #string("MessageP2pSwapCancelled");
                case (#MessageVideoCall) #string("MessageVideoCall");

                // Details category
                case (#NameChanged) #string("NameChanged");
                case (#DescriptionChanged) #string("DescriptionChanged");
                case (#RulesChanged) #string("RulesChanged");
                case (#AvatarChanged) #string("AvatarChanged");
                case (#ExternalUrlUpdated) #string("ExternalUrlUpdated");
                case (#PermissionsChanged) #string("PermissionsChanged");
                case (#GateUpdated) #string("GateUpdated");
                case (#VisibilityChanged) #string("VisibilityChanged");
                case (#Frozen) #string("Frozen");
                case (#Unfrozen) #string("Unfrozen");
                case (#DisappearingMessagesUpdated) #string("DisappearingMessagesUpdated");
                case (#MessagePinned) #string("MessagePinned");
                case (#MessageUnpinned) #string("MessageUnpinned");

                // Membership category
                case (#MembersJoined) #string("MembersJoined");
                case (#MembersLeft) #string("MembersLeft");
                case (#RoleChanged) #string("RoleChanged");
                case (#UsersInvited) #string("UsersInvited");
                case (#UsersBlocked) #string("UsersBlocked");
                case (#UsersUnblocked) #string("UsersUnblocked");
            };
        };
    };
};