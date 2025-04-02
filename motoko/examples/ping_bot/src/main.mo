import HttpTypes "mo:http-types";
import Text "mo:base/Text";
import Router "sdk/http/router";
import DER "sdk/utils/der";
import Definition "routes/definition";
import Hello "routes/hello";
import CommandHandler "sdk/commandHandler";
import Ping "routes/commands/ping";
import Http "sdk/http";
import CommandAdaptor "sdk/commandAdaptor";
import Echo "routes/commands/echo";
import Env "sdk/env";

actor class PingBot(key: Text) {
    stable let ocPublicKey = DER.parsePublicKeyOrTrap(key);

    let registry = CommandHandler.Registry()
        .register(Ping.build())
        .register(Echo.build());

    let router = Router.Router()
        .get("/hello", Hello.handler)
        .get("/*", Definition.handler(registry.definitions()))
        .post("/execute_command", func (request: Http.Request) : async Http.Response {
            await CommandAdaptor.execute(registry, request, ocPublicKey, Env.nowMillis());
        });

    public query func http_request(request : HttpTypes.Request) : async HttpTypes.Response {
        router.handleQuery(request);
    };

    public func http_request_update(request : HttpTypes.UpdateRequest) : async HttpTypes.UpdateResponse {
        await router.handleUpdate(request);
    };
};
