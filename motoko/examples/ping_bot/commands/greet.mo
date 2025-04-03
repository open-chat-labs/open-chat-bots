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
        let user_id = client.context.command.initiator;
        let text = "hello @UserId(" # Principal.toText(user_id) # ")";

        let message = await client
            .sendTextMessage(text)
            .executeThenReturnMessage(null);

        return #ok { message = message };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "greet";
            description = ?"Greet the caller by name";
            placeholder = ?"Please wait";
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