import CommandHandler "../../sdk/commandHandler";
import CommandResponse "../../sdk/api/bot/commandResponse";
import Definition "../../sdk/api/bot/definition";
import Result "mo:base/Result";
import Command "../../sdk/api/common/command";
import Client "../../sdk/client";

module {
    public func build() : CommandHandler.CommandHandler {
        {
            definition = definition();
            execute = execute;    
        };
    };

    func execute(client : Client.CommandClient) : async Result.Result<CommandResponse.SuccessResult, Text> {
        let text = Command.arg(client.context.command, "message");

        let message = await client
            .sendTextMessage(text)
            .executeThenReturnMessage(null);

        return #ok { message = message };
    };

    func definition() : Definition.BotCommand {
        {
            name = "echo";
            description = "Echos the given text";
            placeholder = null;
            params = [{
                name = "text";
                description = "The text to echo";
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