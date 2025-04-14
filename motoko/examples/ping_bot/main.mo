import Http "mo:http-types";
import Sdk "mo:openchat-bot-sdk";
import Env "mo:openchat-bot-sdk/env";

import Echo "commands/echo";
import Ping "commands/ping";
import Start "commands/start";
import Stop "commands/stop";
import SyncApiKey "commands/syncApiKey";
import Definition "definition";
import Metrics "metrics";
import State "state";

actor class PingBot(key : Text) {
    stable var stableState = State.new();

    transient let ocPublicKey = Sdk.parsePublicKeyOrTrap(key);
    transient var state = State.fromStable<system>(stableState);

    transient let registry = Sdk.Command.Registry()
        .register(Echo.build())
        .register(Ping.build())
        .register(Start.build(state))
        .register(Stop.build(state))
        .onSyncApiKey(SyncApiKey.handler(state));

    transient let router = Sdk.Http.Router()
        .get("/metrics", Metrics.handler(state))
        .get("/*", Definition.handler(registry.definitions()))
        .post("/execute_command", func(request : Sdk.Http.Request) : async Sdk.Http.Response {
            await Sdk.executeCommand(registry, request, ocPublicKey, Env.nowMillis());
        },
    );

    public query func http_request(request : Http.Request) : async Http.Response {
        router.handleQuery(request);
    };

    public func http_request_update(request : Http.UpdateRequest) : async Http.UpdateResponse {
        await router.handleUpdate(request);
    };

    system func preupgrade() {
        stableState := State.toStable(state);
    };
};
