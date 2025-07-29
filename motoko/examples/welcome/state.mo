import Iter "mo:base/Iter";
import Chat "mo:openchat-bot-sdk/api/common/chat";
import WelcomeMessages "messages";

module {
    type Chat = Chat.Chat;

    public type State = {
        messages : WelcomeMessages.WelcomeMessages;
    };

    public type StableState = {
        messages : [(Chat, Text)];
    };

    public func new() : StableState {
        {
            messages = [];
        };
    };

    public func fromStable<system>(state : StableState) : State {
        {
            messages = WelcomeMessages.WelcomeMessages(state.messages);
        };
    };

    public func toStable(state : State) : StableState {
        {
            messages = state.messages.entries() |> Iter.toArray(_);
        };
    };
};
