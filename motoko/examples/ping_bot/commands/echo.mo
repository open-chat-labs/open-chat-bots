import Sdk "mo:openchat-bot-sdk";

module {
    public func build() : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute;    
        };
    };

    func execute(client : Sdk.OpenChat.Client) : async Sdk.Command.Result {
        let text = Sdk.Command.Arg.text(client.context.command, "text");

        let message = await client
            .sendTextMessage(text)
            .executeThenReturnMessage(null);

        return #ok { message = message };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "echo";
            description = ?"Echos the given text";
            placeholder = null;
            params = [{
                name = "text";
                description = ?"The text to echo";
                placeholder = null;
                required = true;
                param_type = #StringParam {
                    max_length = 1000;
                    min_length = 1;
                    multi_line = true;
                    choices = [];
                };
            }];
            permissions = {
                community = [];
                chat = [];
                message =[#Text, #Giphy];
            };
            default_role = null;
            direct_messages = ?true;
        }
    };
}