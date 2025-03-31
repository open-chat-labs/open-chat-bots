import HttpTypes "mo:http-types";
import Text "mo:base/Text";
import Http "sdk/http";
import DER "sdk/utils/der";
import Definition "routes/definition";
import Commands "routes/commands";
import Hello "routes/hello";

actor class PingBot(key: Text) {
    stable let ocPublicKey = DER.parsePublicKeyOrTrap(key);

    let router = Http.Router()
        .get("/hello", Hello.handler)
        .get("/*", Definition.handler())
        .post("/execute_command", Commands.handler(ocPublicKey));

    public query func http_request(request : HttpTypes.Request) : async HttpTypes.Response {
        router.handleQuery(request);
    };

    public func http_request_update(request : HttpTypes.UpdateRequest) : async HttpTypes.UpdateResponse {
        await router.handleUpdate(request);
    };
};
