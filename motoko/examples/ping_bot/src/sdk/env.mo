import T "lib";
import Time "mo:base/Time";
import Nat64 "mo:base/Nat64";

module {
    public func now() : T.TimestampMillis {
       Nat64.fromIntWrap(Time.now() / 1_000_000);
    };
}