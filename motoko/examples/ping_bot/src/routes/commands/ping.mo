import CommandHandler "../../sdk/commandHandler";
import CommandResponse "../../sdk/api/bot/commandResponse";
import Definition "../../sdk/api/bot/definition";
import Result "mo:base/Result";
import Client "../../sdk/client";

module {
    public func build() : CommandHandler.CommandHandler {
        {
            definition = definition();
            execute = execute;    
        };
    };

    func execute(client : Client.CommandClient) : async Result.Result<CommandResponse.SuccessResult, Text> {
        let message = await client
            .sendTextMessage("pong")
            .executeThenReturnMessage(null);

        return #ok { message = message };
    };

    func definition() : Definition.BotCommand {
        {
            name = "ping";
            description = "Responds with pong";
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