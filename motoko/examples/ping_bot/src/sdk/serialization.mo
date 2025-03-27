import Json "mo:json";
import Iter "mo:base/Iter";
import Nat64 "mo:base/Nat64";

module {
    public func text(option : Text) : Json.Json = #string(option);

    public func nat64(nat : Nat64) : Json.Json = #number(#int(Nat64.toNat(nat)));

    public func arrayOfValues<T>(values : [T], serializer : T -> Json.Json) : Json.Json {
        #array(values.vals() |> Iter.map(_, serializer) |> Iter.toArray(_));
    };

    public func nullable<T>(value : ?T, serializer : T -> Json.Json) : Json.Json {
        switch (value) {
            case (null) #null_;
            case (?v) serializer(v);
        };
    };

    public func variantWithValue(variant : Text, value : Json.Json) : Json.Json {
        #object_([(variant, value)]);
    };
}