import Result "mo:base/Result";
import Error "mo:base/Error";
module {
    public type CanisterId = Principal;
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

    public type AuthToken = {
        #Jwt : Text;
        #ApiKey : Text;
    };

    public type ChatRole = {
        #Owner;
        #Admin;
        #Moderator;
        #Participant;
    };
}