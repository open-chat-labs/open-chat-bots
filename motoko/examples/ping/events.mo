import Debug "mo:base/Debug";
import Sdk "mo:openchat-bot-sdk";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";
import BotEvents "mo:openchat-bot-sdk/api/common/botEvents";
import State "state";

module {
    public func handler(state : State.State) : Sdk.Http.UpdateHandler {
        func (request : Sdk.Http.Request) : async Sdk.Http.Response {
            let eventWrapperOption : ?BotEvents.BotEventWrapper = from_candid(request.body);

            let ?eventWrapper = eventWrapperOption else {
                Debug.print("Cannot decode event: " # debug_show(request.body));
                return ResponseBuilder.badRequest("Cannot candid decode event");
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