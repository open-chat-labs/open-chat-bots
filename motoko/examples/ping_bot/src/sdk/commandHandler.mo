import Text "mo:base/Text";
import Result "mo:base/Result";
import Array "mo:base/Array";
import Definition "api/bot/definition";
import CommandResponse "api/bot/commandResponse";
import CommandContext "api/bot/commandContext";
import Client "client";

module {
    public type CommandHandler = {
        definition : Definition.BotCommand;
        execute : (Client.CommandClient) -> async Result.Result<CommandResponse.SuccessResult, Text>;
    };

    public class Registry() = this {
        var handlers : [CommandHandler] = [];
        var syncApiKeyHandler : ?CommandHandler = null;

        public func register(handler : CommandHandler) : Registry {
            handlers := Array.append(handlers, [handler]);
            this;
        };

        public func onSyncApiKey(handler : CommandHandler) : Registry {
            syncApiKeyHandler := ?handler;
            this;
        };

        public func definitions() : [Definition.BotCommand] {
            Array.map(handlers, func(handler : CommandHandler) : Definition.BotCommand {
                handler.definition
            });
        };

        public func execute(context : CommandContext.BotCommandContext) : async CommandResponse.Response {
            #BadRequest(#CommandNotFound);
        };
                
        func findHandler(name : Text) : ?CommandHandler {
            Array.find(handlers, func(handler : CommandHandler) : Bool {
                handler.definition.name == name
            })
        };        
    }
}