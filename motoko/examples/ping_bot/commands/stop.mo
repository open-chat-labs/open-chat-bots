import Sdk "mo:openchat-bot-sdk";
import CommandResponse "mo:openchat-bot-sdk/api/bot/commandResponse";
import Scope "mo:openchat-bot-sdk/api/common/commandScope";
import CommandHandler "mo:openchat-bot-sdk/commandHandler";

import S "../state";

module {
    public func build(state : S.State) : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute(state);
        };
    };

    func execute(state : S.State) : CommandHandler.Execute {
        func (client : Sdk.OpenChat.Client) : async Sdk.Command.Result {
            let ?chatDetails = Scope.chatDetails(client.context.scope) else return #err "Expected Chat scope";

            state.subscriptions.remove(chatDetails.chat);

            let message = CommandResponse.EphemeralMessageBuilder(#Text { text = "Stop pinging" }, chatDetails.message_id).build();

            return #ok { message = ?message };
        };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "stop";
            description = ?"Stop pinging";
            placeholder = null;
            params = [];
            permissions = {
                community = [];
                chat = [];
                message =[#Text];
            };
            default_role = ?#Admin;
            direct_messages = null;
        }
    };
}