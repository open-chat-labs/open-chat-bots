import B "../common/base";
import C "../common/botChatContext";
import E "../common/chatEvents";
import R "../common/chatRole";

module {
    type UserId = B.UserId;
    type ChannelId = B.ChannelId;
    type TimestampMillis = B.TimestampMillis;
    type Milliseconds = B.Milliseconds;
    type MessageId = B.MessageId;
    type MessageIndex = B.MessageIndex;
    type EventIndex = B.EventIndex;
    type ChatRole = R.ChatRole;

    public type Actor = actor {
        bot_chat_events_c2c : (Args) -> async Response;
    };

    public type Args = {
        chat_context : C.BotChatContext;
        thread : ?MessageIndex;
        events : EventsSelectionCriteria;
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
        #Error : (Nat16, ?Text);
    };

    public type EventsResponse = {
        events : [B.EventWrapper<E.ChatEvent>];
        unauthorized : [EventIndex];
        expired_event_ranges : [(EventIndex, EventIndex)];
        expired_message_ranges : [(MessageIndex, MessageIndex)];
        latest_event_index : EventIndex;
        chat_last_updated : TimestampMillis;
    };
};
