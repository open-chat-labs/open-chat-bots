import Http "mo:http-types";
import Sdk "mo:openchat-bot-sdk";
import Env "mo:openchat-bot-sdk/env";

import Definition "definition";
import Hello "hello";

actor class GreetBot(key : Text) {
    transient let ocPublicKey = Sdk.parsePublicKeyOrTrap(key);

    transient let registry = Sdk.Command.Registry().register(Hello.build());

    transient let router = Sdk.Http.Router()
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
};
