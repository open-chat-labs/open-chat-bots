import A "../common/accessGates";
import B "../common/base";
import P "../common/chatPermissions";
import Command "../common/command";
import MessageContent "../common/messageContent";

module {
    type UserId = B.UserId;
    type ChannelId = B.ChannelId;
    type TimestampMillis = B.TimestampMillis;
    type Milliseconds = B.Milliseconds;
    type MessageId = B.MessageId;
    type MessageIndex = B.MessageIndex;
    type EventIndex = B.EventIndex;
    type AuthToken = B.AuthToken;
    type ChatRole = B.ChatRole;

    public type Actor = actor {
        bot_chat_events : (Args) -> async Response;
    };

    public type Args = {
        channel_id : ?Nat32;
        events : EventsSelectionCriteria;
        auth_token : AuthToken;
    };

    public type EventsSelectionCriteria = {
        #Page : EventsPageArgs;
        #ByIndex : EventsByIndexArgs;
        #Window : EventsWindowArgs;
    };

    public type EventsPageArgs = {
        start_index : EventIndex;
        ascending : Bool;
        max_messages : Nat32;
        max_events : Nat32;
    };

    public type EventsByIndexArgs = {
        events : [Nat32];
    };

    public type EventsWindowArgs = {
        mid_point : MessageIndex;
        max_messages : Nat32;
        max_events : Nat32;
    };

    public type Response = {
        #Success : EventsResponse;
        #FailedAuthentication : Text;
        #NotAuthorized;
        #NotFound;
        #InternalError : Text;
    };

    public type EventsResponse = {
        events : [EventWrapper<ChatEvent>];
        unauthorized : [EventIndex];
        expired_event_ranges : [(EventIndex, EventIndex)];
        expired_message_ranges : [(MessageIndex, MessageIndex)];
        latest_event_index : EventIndex;
        chat_last_updated : TimestampMillis;
    };

    public type EventWrapper<T> = {
        index : EventIndex;
        timestamp : TimestampMillis;
        correlation_id : Nat64;
        expires_at : ?TimestampMillis;
        event : T;
    };

    public type ChatEvent = {
        #Empty;
        #Message : Message;
        #GroupChatCreated : GroupCreated;
        #DirectChatCreated : DirectChatCreated;
        #GroupNameChanged : GroupNameChanged;
        #GroupDescriptionChanged : GroupDescriptionChanged;
        #GroupRulesChanged : GroupRulesChanged;
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
        #GroupInviteCodeChanged : GroupInviteCodeChanged;
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

    public type GroupCreated = {
        name : Text;
        description : Text;
        created_by : UserId;
    };

    public type DirectChatCreated = {};

    public type GroupNameChanged = {
        new_name : Text;
        previous_name : Text;
        changed_by : UserId;
    };

    public type GroupDescriptionChanged = {
        new_description : Text;
        previous_description : Text;
        changed_by : UserId;
    };

    public type GroupRulesChanged = {
        enabled : Bool;
        prev_enabled : Bool;
        changed_by : UserId;
    };

    public type AvatarChanged = {
        new_avatar : ?Document;
        previous_avatar : ?Document;
        changed_by : UserId;
    };

    public type Document = {
        id : Nat;
        mime_type : Text;
        data : [Nat8];
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

    public type GroupInviteCodeChanged = {
        change : GroupInviteCodeChange;
        changed_by : UserId;
    };

    public type GroupInviteCodeChange = {
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
