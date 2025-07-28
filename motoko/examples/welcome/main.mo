import Http "mo:http-types";
import Sdk "mo:openchat-bot-sdk";
import Env "mo:openchat-bot-sdk/env";

import ClearMessage "commands/clearMessage";
import ReadMessage "commands/readMessage";
import SetMessage "commands/setMessage";
import Definition "definition";
import Events "events";
import State "state";

actor class WelcomeBot(key : Text) {
    stable var stableState = State.new();

    transient let ocPublicKey = Sdk.parsePublicKeyOrTrap(key);
    transient var state = State.fromStable<system>(stableState);

    transient let registry = Sdk.Command.Registry()
        .register(SetMessage.build(state))
        .register(ClearMessage.build(state))
        .register(ReadMessage.build(state));

    transient let router = Sdk.Http.Router()
        .get("/*", Definition.handler(registry.definitions()))
        .post("/execute_command", func(request : Sdk.Http.Request) : async Sdk.Http.Response {
            await Sdk.executeCommand(registry, request, ocPublicKey, Env.nowMillis());
        })
        .post("/notify", Events.handler(state));

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
