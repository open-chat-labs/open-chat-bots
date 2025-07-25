import A "accessGates";
import B "base";
import C "botChatContext";
import P "chatPermissions";
import Command "command";
import MessageContent "messageContent";

module {
    type UserId = B.UserId;
    type ChannelId = B.ChannelId;
    type TimestampMillis = B.TimestampMillis;
    type Milliseconds = B.Milliseconds;
    type MessageId = B.MessageId;
    type MessageIndex = B.MessageIndex;
    type EventIndex = B.EventIndex;
    type ChatRole = B.ChatRole;

    public type ChatEvent = {
        #Empty;
        #Message : Message;
        #GroupChatCreated : GroupCreated;
        #DirectChatCreated : DirectChatCreated;
        #GroupNameChanged : NameChanged;
        #GroupDescriptionChanged : DescriptionChanged;
        #GroupRulesChanged : RulesChanged;
        #AvatarChanged : AvatarChanged;
        #ParticipantsAdded : MembersAdded;
        #ParticipantsRemoved : MembersRemoved;
        #ParticipantJoined : MemberJoined;
        #ParticipantLeft : MemberLeft;
        #RoleChanged : RoleChanged;
        #UsersBlocked : UsersBlocked;
        #UsersUnblocked : UsersUnblocked;
        #MessagePinned : MessagePinned;
        #MessageUnpinned : MessageUnpinned;
        #PermissionsChanged : PermissionsChanged;
        #GroupVisibilityChanged : GroupVisibilityChanged;
        #GroupInviteCodeChanged : InviteCodeChanged;
        #ChatFrozen : GroupFrozen;
        #ChatUnfrozen : GroupUnfrozen;
        #EventsTimeToLiveUpdated : EventsTimeToLiveUpdated;
        #GroupGateUpdated : GroupGateUpdated;
        #UsersInvited : UsersInvited;
        #MembersAddedToDefaultChannel : MembersAddedToDefaultChannel;
        #ExternalUrlUpdated : ExternalUrlUpdated;
        #BotAdded : BotAdded;
        #BotRemoved : BotRemoved;
        #BotUpdated : BotUpdated;
        #FailedToDeserialize;
    };

    public func initiatedBy(event: ChatEvent) : ?UserId {
        switch (event) {
            case (#Message e) ?e.sender;
            case (#DirectChatCreated _) null;
            case (#GroupChatCreated e) ?e.created_by;
            case (#GroupNameChanged e) ?e.changed_by;
            case (#GroupDescriptionChanged e) ?e.changed_by;
            case (#GroupRulesChanged e) ?e.changed_by;
            case (#AvatarChanged e) ?e.changed_by;
            case (#ParticipantsAdded e) ?e.added_by;
            case (#ParticipantsRemoved e) ?e.removed_by;
            case (#ParticipantJoined e) ?e.user_id;
            case (#ParticipantLeft e) ?e.user_id;
            case (#RoleChanged e) ?e.changed_by;
            case (#UsersBlocked e) ?e.blocked_by;
            case (#UsersUnblocked e) ?e.unblocked_by;
            case (#MessagePinned e) ?e.pinned_by;
            case (#MessageUnpinned e) ?e.unpinned_by;
            case (#PermissionsChanged e) ?e.changed_by;
            case (#GroupVisibilityChanged e) ?e.changed_by;
            case (#GroupInviteCodeChanged e) ?e.changed_by;
            case (#ChatFrozen e) ?e.frozen_by;
            case (#ChatUnfrozen e) ?e.unfrozen_by;
            case (#EventsTimeToLiveUpdated e) ?e.updated_by;
            case (#GroupGateUpdated e) ?e.updated_by;
            case (#UsersInvited e) ?e.invited_by;
            case (#MembersAddedToDefaultChannel _) null;
            case (#ExternalUrlUpdated e) ?e.updated_by;
            case (#BotAdded e) ?e.added_by;
            case (#BotRemoved e) ?e.removed_by;
            case (#BotUpdated e) ?e.updated_by;
            case (#FailedToDeserialize) null;
            case (#Empty) null;
        }
    };

    public type GroupCreated = {
        name : Text;
        description : Text;
        created_by : UserId;
    };

    public type DirectChatCreated = {};

    public type NameChanged = {
        new_name : Text;
        previous_name : Text;
        changed_by : UserId;
    };

    public type DescriptionChanged = {
        new_description : Text;
        previous_description : Text;
        changed_by : UserId;
    };

    public type RulesChanged = {
        enabled : Bool;
        prev_enabled : Bool;
        changed_by : UserId;
    };

    public type AvatarChanged = {
        new_avatar : ?B.Document;
        previous_avatar : ?B.Document;
        changed_by : UserId;
    };

    public type MembersAdded = {
        user_ids : [UserId];
        added_by : UserId;
        unblocked : [UserId];
    };

    public type MembersRemoved = {
        user_ids : [UserId];
        removed_by : UserId;
    };

    public type UsersBlocked = {
        user_ids : [UserId];
        blocked_by : UserId;
    };

    public type UsersUnblocked = {
        user_ids : [UserId];
        unblocked_by : UserId;
    };

    public type MemberJoined = {
        user_id : UserId;
        invited_by : ?UserId;
    };

    public type MemberLeft = {
        user_id : UserId;
    };

    public type RoleChanged = {
        user_ids : [UserId];
        changed_by : UserId;
        old_role : ChatRole;
        new_role : ChatRole;
    };

    public type MessagePinned = {
        message_index : MessageIndex;
        pinned_by : UserId;
    };

    public type MessageUnpinned = {
        message_index : MessageIndex;
        unpinned_by : UserId;
        due_to_message_deleted : Bool;
    };

    public type PermissionsChanged = {
        old_permissions_v2 : P.ChatPermissions;
        new_permissions_v2 : P.ChatPermissions;
        changed_by : UserId;
    };

    public type GroupVisibilityChanged = {
        public_ : ?Bool;
        messages_visible_to_non_members : ?Bool;
        changed_by : UserId;
    };

    public type InviteCodeChanged = {
        change : InviteCodeChange;
        changed_by : UserId;
    };

    public type InviteCodeChange = {
        #Enabled;
        #Disabled;
        #Reset;
    };

    public type GroupFrozen = {
        frozen_by : UserId;
        reason : ?Text;
    };

    public type GroupUnfrozen = {
        unfrozen_by : UserId;
    };

    public type EventsTimeToLiveUpdated = {
        updated_by : UserId;
        new_ttl : ?Milliseconds;
    };

    public type GroupGateUpdated = {
        updated_by : UserId;
        new_gate_config : ?A.AccessGateConfig;
    };

    public type MembersAddedToDefaultChannel = {
        count : Nat32;
    };

    public type ExternalUrlUpdated = {
        updated_by : UserId;
        new_url : ?Text;
    };

    public type UsersInvited = {
        user_ids : [UserId];
        invited_by : UserId;
    };

    public type BotAdded = {
        user_id : UserId;
        added_by : UserId;
    };

    public type BotRemoved = {
        user_id : UserId;
        removed_by : UserId;
    };

    public type BotUpdated = {
        user_id : UserId;
        updated_by : UserId;
    };

    public type Message = {
        message_index : MessageIndex;
        message_id : MessageId;
        sender : UserId;
        content : MessageContent.MessageContent;
        bot_context : ?BotMessageContext;
        replies_to : ?ReplyContext;
        reactions : [(Text, [UserId])];
        tips : Tips;
        thread_summary : ?ThreadSummary;
        edited : Bool;
        forwarded : Bool;
        block_level_markdown : Bool;
    };

    public type ThreadSummary = {
        participant_ids : [UserId];
        followed_by_me : Bool;
        reply_count : Nat32;
        latest_event_index : EventIndex;
        latest_event_timestamp : TimestampMillis;
    };

    public type BotMessageContext = {
        command : ?Command.Command;
        finalised : Bool;
    };

    public type ReplyContext = {
        chat_if_other : ?(Chat, ?MessageIndex);
        event_index : EventIndex;
    };

    public type Chat = {
        #Direct : B.CanisterId;
        #Group : B.CanisterId;
        #Channel : (B.CanisterId, B.ChannelId);
    };

    public type Tips = [(B.CanisterId, [(B.UserId, Nat)])];
};
