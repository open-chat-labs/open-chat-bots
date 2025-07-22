import Sdk "mo:openchat-bot-sdk";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";

import State "state";

module {
    public func handler(_state : State.State) : Sdk.Http.UpdateHandler {
        func (_request : Sdk.Http.Request) : async Sdk.Http.Response {
            ResponseBuilder.text(200, "This endpoint is not implemented yet. Please check back later.");
        };
    };
}