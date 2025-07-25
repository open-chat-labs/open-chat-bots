import Principal "mo:base/Principal";
import Sdk "mo:openchat-bot-sdk";

module {
    public func build() : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute;
        };
    };

    func execute(client : Sdk.OpenChat.CommandClient) : async Sdk.Command.Result {
        let userId = client.context.command.initiator;
        let text = "hello @UserId(" # Principal.toText(userId) # ")";

        let message = await client.sendTextMessage(text).executeThenReturnMessage(null);

        return #ok { message = message };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "hello";
            description = ?"Replies with hello <username>";
            placeholder = null;
            params = [];
            permissions = {
                community = [];
                chat = [];
                message = [#Text];
            };
            default_role = null;
            direct_messages = null;
        };
    };
};
