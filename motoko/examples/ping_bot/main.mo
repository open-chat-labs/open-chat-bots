import Http "mo:http-types";
import Env "mo:openchat-bot-sdk/env";
import Sdk "mo:openchat-bot-sdk";
import Definition "definition";
import Echo "commands/echo";
import Greet "commands/greet";
import Ping "commands/ping";
import Start "commands/start";
import Stop "commands/stop";
import ApiKeyRegistry "mo:openchat-bot-sdk/apiKeyRegistry";

actor class GreetBot(key: Text) {
    let ocPublicKey = Sdk.parsePublicKeyOrTrap(key);

    var apiKeyRegistry = ApiKeyRegistry.new([]);

    stable var apiKeys : [Text] = [];

    let registry = Sdk.Command.Registry()
        .register(Echo.build())
        .register(Greet.build())
        .register(Ping.build())
        .register(Start.build())
        .register(Stop.build());

    let router = Sdk.Http.Router(apiKeyRegistry)
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

    system func preupgrade() {
        apiKeys := apiKeyRegistry.getApiKeys();
    };

    system func postupgrade() {
        apiKeyRegistry := ApiKeyRegistry.new(apiKeys);
    };
}
