import Sdk "mo:openchat-bot-sdk";
import CommandResponse "mo:openchat-bot-sdk/api/bot/commandResponse";
import Scope "mo:openchat-bot-sdk/api/common/commandScope";

module {
    public func build() : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute;    
        };
    };

    func execute(client : Sdk.OpenChat.Client) : async Sdk.Command.Result {
        let ?messageId = Scope.messageId(client.context.scope) else return #err "Expected Chat scope";        

        let message = CommandResponse.EphemeralMessageBuilder(#Text { text = "Stop pinging" }, messageId).build();

        return #ok { message = ?message };
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