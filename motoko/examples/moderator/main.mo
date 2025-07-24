import Http "mo:http-types";
import Sdk "mo:openchat-bot-sdk";

import Definition "definition";
import Events "events";
import State "state";

actor class ModeratorBot() {
    stable var stableState = State.new();

    transient var state = State.fromStable<system>(stableState);

    transient let router = Sdk.Http.Router()
        .get("/*", Definition.handler())
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
