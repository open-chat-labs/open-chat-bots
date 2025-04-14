import A "../common/accessGates";
import B "../common/base";
import P "../common/chatPermissions";

module {
    public type Actor = actor {
        bot_chat_details : (Args) -> async Response;
    };

    public type Args = {
        channel_id : ?Nat32;
        auth_token : B.AuthToken;
    };

    public type Response = {
        #Success : ChatDetails;
        #FailedAuthentication : Text;
        #DirectChatUnsupported;
        #NotAuthorized;
        #NotFound;
        #InternalError : Text;
    };

    public type ChatDetails = {
        name : Text;
        description : Text;
        avatar_id : ?Nat;
        is_public : Bool;
        history_visible_to_new_joiners : Bool;
        messages_visible_to_non_members : Bool;
        permissions : P.ChatPermissions;
        rules : VersionedRules;
        events_ttl : ?B.Milliseconds;
        events_ttl_last_updated : ?B.TimestampMillis;
        gate_config : ?A.AccessGateConfig;
        video_call_in_progress : ?VideoCall;
        verified : ?Bool;
        frozen : ?FrozenGroupInfo;
        date_last_pinned : ?B.TimestampMillis;
        last_updated : B.TimestampMillis;
        external_url : ?Text;
        latest_event_index : B.EventIndex;
        latest_message_index : ?B.MessageIndex;
        member_count : Nat32;
    };

    public type VersionedRules = {
        text : Text;
        version : Nat32;
        enabled : Bool;
    };

    public type VideoCall = {
        message_index : B.MessageIndex;
        call_type : VideoCallType;
    };

    public type VideoCallType = {
        #Default;
        #Broadcast;
    };

    public type FrozenGroupInfo = {
        timestamp : B.TimestampMillis;
        frozen_by : B.UserId;
        reason : ?Text;
    };
};
