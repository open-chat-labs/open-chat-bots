import Http "../http";
import Array "mo:base/Array";
import Option "mo:base/Option";

module {
    public func header(req : Http.Request, name: Text) : ?Text {
        req.headers 
            |> Array.find(_, func((k: Text, _v: Text)) : Bool = name == k) 
            |> Option.map(_, func((_k: Text, v: Text)) : Text { v });
    };
}