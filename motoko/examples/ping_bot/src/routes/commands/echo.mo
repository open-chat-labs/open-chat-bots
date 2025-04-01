import Client "../../sdk/client";
import CommandHandler "../../sdk/commandHandler";
import CommandResponse "../../sdk/api/bot/commandResponse";
import Definition "../../sdk/api/bot/definition";
import Result "mo:base/Result";
import SendMessage "../../sdk/client/sendMessage";
import CommandContext "../../sdk/api/bot/commandContext";
import Command "../../sdk/api/common/command";

module {
    public func build() : CommandHandler.CommandHandler {
        {
            definition = definition();
            execute = execute;    
        };
    };

    func execute(client : Client.Client<CommandContext.BotCommandContextWrapper>) : async Result.Result<CommandResponse.SuccessResult, Text> {
        let text = client.context.command() |> Command.arg(_, "message");

        let message = await client  
            .sendTextMessage(text)
            .executeThenReturnMessage(func (result : SendMessage.Result) {});

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