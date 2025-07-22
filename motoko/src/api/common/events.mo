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
                case (#Created) #string("created");
                case (#NameChanged) #string("name_changed");
                case (#DescriptionChanged) #string("description_changed");
                case (#RulesChanged) #string("rules_changed");
                case (#AvatarChanged) #string("avatar_changed");
                case (#BannerChanged) #string("banner_changed");
                case (#PermissionsChanged) #string("permissions_changed");
                case (#VisibilityChanged) #string("visibility_changed");
                case (#Frozen) #string("frozen");
                case (#Unfrozen) #string("unfrozen");
                case (#GateUpdated) #string("gate_updated");
                case (#MessagePinned) #string("message_pinned");
                case (#MessageUnpinned) #string("message_unpinned");
                case (#PrimaryLanguageChanged) #string("primary_language_changed");
                case (#GroupImported) #string("group_imported");
                case (#ChannelCreated) #string("channel_created");
                case (#ChannelDeleted) #string("channel_deleted");

                // Membership category
                case (#MemberJoined) #string("member_joined");
                case (#MemberLeft) #string("member_left");
                case (#MembersRemoved) #string("members_removed");
                case (#RoleChanged) #string("role_changed");
                case (#UsersInvited) #string("users_invited");
                case (#BotAdded) #string("bot_added");
                case (#BotRemoved) #string("bot_removed");
                case (#BotUpdated) #string("bot_updated");
                case (#UsersBlocked) #string("users_blocked");
                case (#UsersUnblocked) #string("users_unblocked");
            };
        };

        public func serializeChatEventType(event_type : ChatEventType) : Json.Json {
            switch (event_type) {
                // Message category
                case (#Message) #string("message");
                case (#MessageEdited) #string("message_edited");
                case (#MessageReaction) #string("message_reaction");
                case (#MessageTipped) #string("message_tipped");
                case (#MessageDeleted) #string("message_deleted");
                case (#MessageUndeleted) #string("message_undeleted");
                case (#MessagePollVote) #string("message_poll_vote");
                case (#MessagePollEnded) #string("message_poll_ended");
                case (#MessagePrizeClaim) #string("message_prize_claim");
                case (#MessageP2pSwapCompleted) #string("message_p2p_swap_completed");
                case (#MessageP2pSwapCancelled) #string("message_p2p_swap_cancelled");
                case (#MessageVideoCall) #string("message_video_call");

                // Details category
                case (#NameChanged) #string("name_changed");
                case (#DescriptionChanged) #string("description_changed");
                case (#RulesChanged) #string("rules_changed");
                case (#AvatarChanged) #string("avatar_changed");
                case (#ExternalUrlUpdated) #string("external_url_updated");
                case (#PermissionsChanged) #string("permissions_changed");
                case (#GateUpdated) #string("gate_updated");
                case (#VisibilityChanged) #string("visibility_changed");
                case (#Frozen) #string("frozen");
                case (#Unfrozen) #string("unfrozen");
                case (#DisappearingMessagesUpdated) #string("disappearing_messages_updated");
                case (#MessagePinned) #string("message_pinned");
                case (#MessageUnpinned) #string("message_unpinned");

                // Membership category
                case (#MembersJoined) #string("members_joined");
                case (#MembersLeft) #string("members_left");
                case (#RoleChanged) #string("role_changed");
                case (#UsersInvited) #string("users_invited");
                case (#UsersBlocked) #string("users_blocked");
                case (#UsersUnblocked) #string("users_unblocked");
            };
        };
    };
};