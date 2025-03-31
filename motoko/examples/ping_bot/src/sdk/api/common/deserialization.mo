import Json "mo:json";
import Result "mo:base/Result";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import IterTools "mo:itertools/Iter";
import Principal "mo:base/Principal";

module {
    public func arrayOfValues<T>(json : [Json.Json], deserialize : Json.Json -> Result.Result<T, Text>) : Result.Result<[T], Text> {
        let buffer = Buffer.Buffer<T>(json.size());
        for ((i, val) in IterTools.enumerate(json.vals())) {
            switch (deserialize(val)) {
                case (#ok(v)) buffer.add(v);
                case (#err(e)) return #err("Failed to deserialize array value [" # Nat.toText(i) # "]: " # e);
            };
        };
        #ok(Buffer.toArray(buffer));
    };

    public func principal(json : Json.Json, path : Json.Path) : Result.Result<Principal, { #pathNotFound; #typeMismatch }> {
        switch (Json.getAsText(json, path)) {
            case (#ok(v)) #ok(Principal.fromText(v));
            case (#err(e)) return #err(e);
        };
    }
}