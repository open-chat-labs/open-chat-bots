import Sdk "mo:openchat-bot-sdk";
import Principal "mo:base/Principal";

module {
    public func build() : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute;    
        };
    };

    func execute(client : Sdk.OpenChat.Client) : async Sdk.Command.Result {
        let userId = client.context.command.initiator;
        let text = "hello @UserId(" # Principal.toText(userId)  # ")";

        let message = await client
            .sendTextMessage(text)
            .executeThenReturnMessage(null);

        return #ok { message = message };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "greet";
            description = ?"Responds with pong";
            placeholder = null;
            params = [];
            permissions = {
                community = [];
                chat = [];
                message =[#Text];
            };
            default_role = null;
            direct_messages = null;
        }
    };
}