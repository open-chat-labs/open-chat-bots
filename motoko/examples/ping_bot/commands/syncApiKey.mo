import Sdk "mo:openchat-bot-sdk";
import CommandContext "mo:openchat-bot-sdk/api/bot/commandContext";
import CommandHandler "mo:openchat-bot-sdk/commandHandler";

import S "../state";

module {
    public func handler(state : S.State) : CommandHandler.SyncHandler {
        func (context : CommandContext.CommandContext) {
            let apiKey = Sdk.Command.Arg.text(context.command, "api_key");

            switch (state.apiKeyRegistry.insert(apiKey)) {
                case (#ok) {
                    #Success { message = null };
                };
                case (#err(err)) {
                    #BadRequest(#AccessTokenInvalid(err));
                };
            };        
        };
    };
}