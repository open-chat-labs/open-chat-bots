import Iter "mo:base/Iter";
import ApiKeyRegistry "mo:openchat-bot-sdk/apiKeyRegistry";
import Subscriptions "subscriptions";

module {
    public type State = {
        apiKeyRegistry : ApiKeyRegistry.ApiKeyRegistry;
        subscriptions : Subscriptions.ChatSubscriptions;
    };

    public type StableState = {
        apiKeys : [ApiKeyRegistry.ApiKeyRecord];
        subscriptions : [Subscriptions.Sub];
    };

    public func new() : StableState {
        {
            apiKeys = [];
            subscriptions = [];
        };
    };

    public func fromStable<system>(state : StableState) : State {
        let apiKeyRegistry = ApiKeyRegistry.new(state.apiKeys);
        let subscriptions = Subscriptions.new<system>(state.subscriptions);
        {
            apiKeyRegistry = apiKeyRegistry;
            subscriptions = subscriptions;
        };
    };

    public func toStable(state : State) : StableState {
        {
            apiKeys = state.apiKeyRegistry.iter() |> Iter.toArray(_);
            subscriptions = state.subscriptions.iter() |> Iter.toArray(_);
        };
    };
};
