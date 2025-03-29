import HttpTypes "mo:http-types";
import Text "mo:base/Text";
import Http "sdk/http";
import DER "sdk/der";
import Definition "routes/definition";
import Commands "routes/commands";
import Hello "routes/hello";

actor class PingBot(key: Text) {
    stable var ocPublicKey = DER.parsePublicKeyOrTrap(key);

    let state = {
        ocPublicKey = ocPublicKey;
    };

    let router = Http.Router(state)
        .get("/hello", Hello.handler)
        .get("/*", Definition.build())
        .post("/execute_command", Command.execute);

    public query func http_request(request : HttpTypes.Request) : async HttpTypes.Response {
        router.handleQuery(request);
    };

    public func http_request_update(request : HttpTypes.UpdateRequest) : async HttpTypes.UpdateResponse {
        await router.handleUpdate(request);
    };
};
