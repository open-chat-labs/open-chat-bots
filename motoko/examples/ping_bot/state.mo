import Array "mo:base/Array";
import Iter "mo:base/Iter";
import Option "mo:base/Option";
import Chat "mo:openchat-bot-sdk/api/common/chat";
import Permissions "mo:openchat-bot-sdk/api/common/permissions";
import ApiKeyRegistry "mo:openchat-bot-sdk/apiKeyRegistry";

import Subscriptions "subscriptions";

module {
    public type State = {
        apiKeyRegistry : ApiKeyRegistry.ApiKeyRegistry;
        subscriptions : Subscriptions.ChatSubscriptions;
    };

    public type StableState = {
        apiKeys : [Text];
        subscriptions : [StableSub];
    };

    public type StableSub = {
        chat : Chat.Chat;
        interval : Nat;
        iterations : Nat8;
    };

    public func new() : StableState {
        {
            apiKeys = [];
            subscriptions = [];
        };
    };

    public func fromStable<system>(state : StableState) : State {
        let apiKeyRegistry = ApiKeyRegistry.new(state.apiKeys);

        let subs = Array.mapFilter(
            state.subscriptions,
            func(subscription : StableSub) : ?Subscriptions.Sub {
                hydrateSub(subscription, apiKeyRegistry);
            },
        );

        let subscriptions = Subscriptions.new<system>(subs);

        {
            apiKeyRegistry = apiKeyRegistry;
            subscriptions = subscriptions;
        };
    };

    public func toStable(state : State) : StableState {
        {
            apiKeys = state.apiKeyRegistry.getApiKeys();
            subscriptions = state.subscriptions.iter() |> Iter.map(
                _,
                func(sub : Subscriptions.Sub) : (StableSub) {{
                    chat = sub.chat;
                    interval = sub.interval;
                    iterations = sub.iterations;
                }},
            ) |> Iter.toArray(_);
        };
    };

    func hydrateSub(sub : StableSub, registry : ApiKeyRegistry.ApiKeyRegistry) : ?Subscriptions.Sub {
        registry.getKeyWithRequiredPermissions(
            #Chat(sub.chat),
            Permissions.textOnly(),
        ) |> Option.map(_, func(record : ApiKeyRegistry.Record) : Subscriptions.Sub {{ 
            chat = sub.chat; 
            interval = sub.interval; 
            apiKey = record.key; 
            iterations = sub.iterations; 
        }});
    };
};
