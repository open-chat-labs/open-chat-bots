import Result "mo:base/Result";

import CommandResponse "api/bot/commandResponse";
import DefinitionInternal "api/bot/definition";
import CommandInternal "api/common/command";
import Client "client";
import CommandAdaptor "commandAdaptor";
import CommandHandler "commandHandler";
import HttpInternal "http";
import Builder "http/responseBuilder";
import RouterInternal "http/router";
import Der "utils/der";
//import ApiKeyRegistry "apiKeyRegistry";

module {
    public module Definition {
        public type Bot = DefinitionInternal.Bot;
        public type Command = DefinitionInternal.Command;
        public type AutonomousConfig = DefinitionInternal.AutonomousConfig;
        public let serialize = DefinitionInternal.serialize;
    };

    public module Http {
        public type Request = HttpInternal.Request;
        public type Response = HttpInternal.Response;
        public type QueryHandler = RouterInternal.QueryHandler;
        public type UpdateHandler = RouterInternal.UpdateHandler;
        public let Router = RouterInternal.Router;
        public let ResponseBuilder = Builder.Builder;
    };

    public module Command {
        public type Handler = CommandHandler.CommandHandler;
        public type SuccessResult = CommandResponse.SuccessResult;
        public type Result = Result.Result<SuccessResult, Text>;
        public let Registry = CommandHandler.Registry;

        public module Arg {
            public let text = CommandInternal.argText;
            public let int = CommandInternal.argInt;
            public let float = CommandInternal.argFloat;
            public let bool = CommandInternal.argBool;
            public let user = CommandInternal.argUser;
            public let timestamp = CommandInternal.argTimestamp;
            public let maybeText = CommandInternal.maybeArgText;
            public let maybeInt = CommandInternal.maybeArgInt;
            public let maybeFloat = CommandInternal.maybeArgFloat;
            public let maybeBool = CommandInternal.maybeArgBool;
            public let maybeUser = CommandInternal.maybeArgUser;
            public let maybeTimestamp = CommandInternal.maybeArgTimestamp;
        };
    };

    public module OpenChat {
        public type Client = Client.CommandClient;
    };

    public let parsePublicKeyOrTrap = Der.parsePublicKeyOrTrap;
    public let executeCommand = CommandAdaptor.execute;

    //public type ApiKeyRegistry = ApiKeyRegistry.ApiKeyRegistry;
};
