import Http "mo:http-types";
import Env "mo:openchat-bot-sdk/env";
import Sdk "mo:openchat-bot-sdk";
import Definition "definition";
import Echo "commands/echo";
import Greet "commands/greet";
import Ping "commands/ping";
import Start "commands/start";
import Stop "commands/stop";
import SyncApiKey "commands/syncApiKey";
import State "state";
import Metrics "metrics";

actor class GreetBot(key: Text) {
    stable var stableState = State.new();    

    transient let ocPublicKey = Sdk.parsePublicKeyOrTrap(key);
    transient var state = State.fromStable<system>(stableState);

    transient let registry = Sdk.Command.Registry()
        .register(Echo.build())
        .register(Greet.build())
        .register(Ping.build())
        .register(Start.build(state))
        .register(Stop.build(state))
        .onSyncApiKey(SyncApiKey.handler(state));

    transient let router = Sdk.Http.Router()
        .get("/metrics", Metrics.handler(state))
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
        stableState := State.toStable(state);
    };

    system func postupgrade() {
        state := State.fromStable<system>(stableState);
    };
}
