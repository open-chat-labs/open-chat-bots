import Json "mo:json";
import Sdk "mo:openchat-bot-sdk";
import S "state";

module {
    public func handler(state : S.State) : Sdk.Http.QueryHandler {
        func (_ : Sdk.Http.Request) : Sdk.Http.Response {
            Sdk.Http.ResponseBuilder()
                .withAllowHeaders()
                .withJson(metrics(state))
                .build()            
        };
    };

    func metrics(state : S.State) : Json.Json {
        #object_([
            ("apiKeys", #number(#int(state.apiKeyRegistry.count()))),
            ("subscriptions", #number(#int(state.subscriptions.count()))),
        ]);
    };
}