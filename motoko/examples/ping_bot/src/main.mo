import HttpTypes "mo:http-types";
import Text "mo:base/Text";
import Http "sdk/http";
import DER "sdk/der";
import Definition "definition";
import Command "routes/command";
import Hello "routes/hello";
import Router "routes/state";

actor class PingBot(key: Text) {
    stable var ocPublicKey = DER.parsePublicKeyOrTrap(key);

    let state : Router.State = {
        ocPublicKey = ocPublicKey;
    };

    let definition = Definition.build();

    let router = Http.Router(?state)
        .get("/hello", Hello.handler)
        .get("/*", func (_) { definition; })
        .post("/execute_command", Command.execute);

    public query func http_request(request : HttpTypes.Request) : async HttpTypes.Response {
        router.handleQuery(request);
    };

    public func http_request_update(request : HttpTypes.UpdateRequest) : async HttpTypes.UpdateResponse {
        await router.handleUpdate(request);
    };
};
