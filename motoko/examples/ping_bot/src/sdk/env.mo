import Base "api/common/base";
import Time "mo:base/Time";
import Nat64 "mo:base/Nat64";

module {
    public func nowMillis() : Base.TimestampMillis {
        let now = Time.now();
        let millis = now / 1_000_000;
        Nat64.fromIntWrap(millis)
    };
}