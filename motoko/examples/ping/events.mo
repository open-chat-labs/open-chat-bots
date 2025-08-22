import Debug "mo:base/Debug";
import Ecdsa "mo:ecdsa";
import Sdk "mo:openchat-bot-sdk";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";
import BotEvents "mo:openchat-bot-sdk/api/common/botEvents";
import State "state";

module {
    public func handler(state : State.State, ocPublicKey : Ecdsa.PublicKey) : Sdk.Http.UpdateHandler {
        func (request : Sdk.Http.Request) : async Sdk.Http.Response {
            let eventWrapper = switch (BotEvents.parseJwt(request.body, ocPublicKey)) {
                case (#ok(eventWrapper)) eventWrapper;
                case (#err(e)) {
                    Debug.print(e);
                    return ResponseBuilder.badRequest("Cannot candid decode event: " # e);
                };
            };

            switch (eventWrapper.event) {
                case (#Lifecycle lifecycleEvent) {
                    switch (lifecycleEvent) {
                        case (#Uninstalled event) {
                            state.apiKeyRegistry.remove(event.location);
                        };
                        case _ {};
                    };
                };
                case _ {};
            };

            return ResponseBuilder.success();
        };
    };
}