import ApiKeyRegistry "mo:openchat-bot-sdk/apiKeyRegistry";
import Subscriptions "subscriptions";
import Chat "mo:openchat-bot-sdk/api/common/chat";
import Permissions "mo:openchat-bot-sdk/api/common/permissions";
import Array "mo:base/Array";
import Option "mo:base/Option";

module {
    public type State = {
        apiKeyRegistry : ApiKeyRegistry.ApiKeyRegistry;
        subscriptions : Subscriptions.ChatSubscriptions;
    };

    public type StableState = {
        apiKeys : [Text];
        subscriptions : [(Chat.Chat, Nat)];
    };

    public func new() : StableState {
        {
            apiKeys = [];
            subscriptions = [];
        }
    };

    public func fromStable<system>(state : StableState) : State {
        let apiKeyRegistry = ApiKeyRegistry.new(state.apiKeys);
        
        let subs = Array.mapFilter(state.subscriptions, func (subscription : (Chat.Chat, Nat)) : ?Subscriptions.Sub {
             hydrateSub(subscription, apiKeyRegistry);
        });

        let subscriptions = Subscriptions.new<system>(subs);

        {
            apiKeyRegistry = apiKeyRegistry;
            subscriptions = subscriptions;
        };
    };

    public func toStable(state : State) : StableState {
        {
            apiKeys = state.apiKeyRegistry.getApiKeys();
            subscriptions = state.subscriptions.getAll();
        }
    };

    func hydrateSub((chat : Chat.Chat, n : Nat), registry : ApiKeyRegistry.ApiKeyRegistry) : ?Subscriptions.Sub {
        registry
            .getKeyWithRequiredPermissions(
                #Chat(chat),
                Permissions.textOnly(),
            ) |> Option.map(_, func (record : ApiKeyRegistry.Record) : Subscriptions.Sub {
                {
                    chat = chat;
                    interval = n;
                    apiKey = record.key;
                }
            });
    };
}