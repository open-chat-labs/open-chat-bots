import Sdk "mo:openchat-bot-sdk";
import CommandHandler "mo:openchat-bot-sdk/commandHandler";
import CommandScope "mo:openchat-bot-sdk/api/common/commandScope";
import CommandResponse "mo:openchat-bot-sdk/api/bot/commandResponse";

import S "../state";

module {
    public func build(state : S.State) : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute(state);
        };
    };

    func execute(state : S.State) : CommandHandler.Execute {
        func (_ : Sdk.OpenChat.Client, context : Sdk.Command.Context) : async Sdk.Command.Result {
            let ?chatDetails = CommandScope.chatDetails(context.scope) else return #err "Expected Chat scope";

            let text = switch (state.messages.get(chatDetails.chat)) {
                case (?text) text;
                case null "No welcome message is currently set";
            };

            let message = CommandResponse.EphemeralMessageBuilder(
                #Text { text = text }, 
                chatDetails.message_id).build();

            return #ok { message = ?message };
        };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "read_message";
            description = ?"This will show the current welcome message.";
            placeholder = null;
            params = [];
            permissions = {
                community = [];
                chat = [];
                message = [];
            };
            default_role = ?#Admin;
            direct_messages = ?false;
        };
    };
};
