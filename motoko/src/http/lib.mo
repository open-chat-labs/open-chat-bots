import Array "mo:base/Array";
import Option "mo:base/Option";

module {
    public type Request = {
        url : Text;
        body : Blob;
        headers : [(Text, Text)];
    };

    public type Response = {
        status_code : Nat16;
        headers : [(Text, Text)];
        body : Blob;
    };

    public func requestHeader(req : Request, name : Text) : ?Text {
        req.headers
        |> Array.find(_, func((k : Text, _v : Text)) : Bool = name == k)
        |> Option.map(_, func((_k : Text, v : Text)) : Text { v });
    };
};
