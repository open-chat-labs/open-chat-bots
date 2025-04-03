import Http "mo:http-types";
import Env "mo:openchat-bot-sdk/env";
import Sdk "mo:openchat-bot-sdk";
import Definition "definition";
import Echo "commands/echo";
import Greet "commands/greet";
import Ping "commands/ping";

actor class GreetBot(key: Text) {
    stable let ocPublicKey = Sdk.parsePublicKeyOrTrap(key);

    let registry = Sdk.Command.Registry()
        .register(Echo.build())
        .register(Greet.build())
        .register(Ping.build());

    let router = Sdk.Http.Router()
        .get("/*", Definition.handler(registry.definitions()))
        .post("/execute_command", func (request: Sdk.Http.Request) : async Sdk.Http.Response {
            await Sdk.executeCommand(registry, request, ocPublicKey, Env.nowMillis());
        });

    public query func http_request(request : Http.Request) : async Http.Response {
        router.handleQuery(request);
    };

    public func http_request_update(request : Http.UpdateRequest) : async Http.UpdateResponse {
        await router.handleUpdate(request);
    };
}
