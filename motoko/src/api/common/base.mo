import Error "mo:base/Error";
import Result "mo:base/Result";

module {
    public type CanisterId = Principal;
    public type ChatId = CanisterId;
    public type CommunityId = CanisterId;
    public type UserId = Principal;
    public type ChannelId = Nat32;
    public type TimestampMillis = Nat64;
    public type TimestampNanos = Nat64;
    public type Milliseconds = Nat64;
    public type Nanoseconds = Nat64;
    public type MessageId = Nat64;
    public type MessageIndex = Nat32;
    public type EventIndex = Nat32;
    public type Hash = [Nat8]; // 32 bytes

    public type CallResult<T> = Result.Result<T, Error.Error>;

    public type UnitResult = {
        #Success;
        #Error : (Nat16, ?Text);
    };

    public type ChatRole = {
        #Owner;
        #Admin;
        #Moderator;
        #Participant;
    };

    public type Rules = {
        text : Text;
        enabled : Bool;
    };

    public type Document = {
        id : Nat;
        mime_type : Text;
        data : [Nat8];
    };
};
