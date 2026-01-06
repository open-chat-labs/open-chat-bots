import B "../common/base";
import E "../common/communityEvents";
import R "../common/chatRole";

module {
    type UserId = B.UserId;
    type ChannelId = B.ChannelId;
    type CommunityId = B.CommunityId;
    type TimestampMillis = B.TimestampMillis;
    type Milliseconds = B.Milliseconds;
    type MessageId = B.MessageId;
    type MessageIndex = B.MessageIndex;
    type EventIndex = B.EventIndex;
    type ChatRole = R.ChatRole;

    public type Actor = actor {
        bot_community_events_c2c : (Args) -> async Response;
    };

    public type Args = {
        community_id : CommunityId;
        events : EventsSelectionCriteria;
    };

    public type EventsSelectionCriteria = {
        #Page : EventsPageArgs;
        #ByIndex : EventsByIndexArgs;
    };

    public type EventsPageArgs = {
        start_index : EventIndex;
        ascending : Bool;
        max_events : Nat32;
    };

    public type EventsByIndexArgs = {
        events : [Nat32];
    };

    public type Response = {
        #Success : EventsResponse;
        #Error : (Nat16, ?Text);
    };

    public type EventsResponse = {
        events : [B.EventWrapper<E.CommunityEvent>];
        latest_event_index : EventIndex;
        community_last_updated : TimestampMillis;
    };
};
