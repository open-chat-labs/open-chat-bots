import Text "mo:base/Text";
import Result "mo:base/Result";
import Array "mo:base/Array";
import Time "mo:base/Time";
import Definition "api/bot/definition";
import CommandResponse "api/bot/commandResponse";
import CommandContext "api/bot/commandContext";
import Client "client";
import Der "utils/der";

module {
    public type CommandHandler = {
        definition : Definition.BotCommand;
        execute : (Client.CommandClient) -> async Result.Result<CommandResponse.SuccessResult, Text>;
    };

    public type SyncHandler = CommandContext.BotCommandContext -> CommandResponse.Response;

    public class Registry() = this {
        var handlers : [CommandHandler] = [];
        var syncApiKeyHandler : ?SyncHandler = null;

        public func register(handler : CommandHandler) : Registry {
            handlers := Array.append(handlers, [handler]);
            this;
        };

        public func onSyncApiKey(handler : SyncHandler) : Registry {
            syncApiKeyHandler := ?handler;
            this;
        };

        public func definitions() : [Definition.BotCommand] {
            Array.map(handlers, func(handler : CommandHandler) : Definition.BotCommand {
                handler.definition
            });
        };

        public func execute(jwt : Text, ocPublicKey : Der.PublicKey, now : Time.Time) : async CommandResponse.Response {
            let context = switch (CommandContext.parseJwt(jwt, ocPublicKey, now)) {
                case (#err(#invalidSignature)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid signature"));
                case (#err(#expired(_))) return #BadRequest(#AccessTokenExpired);
                case (#err(#parseError(reason))) return #BadRequest(#AccessTokenInvalid("JWT: Parse error: " # reason));
                case (#err(#invalidClaims)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid claims"));
                case (#ok(data)) data;
            };

            let commandName = context.command.name;

            if (commandName == "sync_api_key") {
                switch (syncApiKeyHandler) {
                    case (?handler) {
                        // TODO: Check args
                        return handler(context);
                    };
                    case null return #BadRequest(#CommandNotFound);
                };
            };

            let ?handler = findHandler(commandName) else {
                return #BadRequest(#CommandNotFound);
            };

            // TODO: Check args

            switch(await handler.execute(Client.CommandClient(context))) {
                case (#ok(result)) return #Success(result);
                case (#err(error)) {
                    return #InternalError(#CommandError(error));
                };
            }
        };
                
        func findHandler(name : Text) : ?CommandHandler {
            Array.find(handlers, func(handler : CommandHandler) : Bool {
                handler.definition.name == name
            })
        };        
    }
}