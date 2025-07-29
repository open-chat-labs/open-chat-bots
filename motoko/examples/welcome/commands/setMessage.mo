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
            let text = Sdk.Command.Arg.text(context.command, "message");

            state.messages.set(chatDetails.chat, text);

            let message = CommandResponse.EphemeralMessageBuilder(
                #Text { text = "Welcome message set" }, 
                chatDetails.message_id).build();

            return #ok { message = ?message };
        };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "set_message";
            description = ?"This will set a welcome message to be sent to new members of a group or community. For a community the welcome message will be sent in the channel first joined by the user. If you include the text {USERNAME} then the user's name will be inserted.";
            placeholder = null;
            params = [{
                name = "message";
                description = ?"The welcome message to set";
                placeholder = null;
                required = true;
                param_type = #StringParam {
                    min_length = 1;
                    max_length = 1000;
                    multi_line = true;
                    choices = [];
                };
            }];
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
