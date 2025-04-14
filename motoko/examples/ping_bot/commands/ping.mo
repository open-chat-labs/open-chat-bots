import Sdk "mo:openchat-bot-sdk";

module {
    public func build() : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute;
        };
    };

    func execute(client : Sdk.OpenChat.Client) : async Sdk.Command.Result {
        let message = await client
            .sendTextMessage("pong")
            .executeThenReturnMessage(null);

        return #ok { message = message };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "ping";
            description = ?"Responds with pong";
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
