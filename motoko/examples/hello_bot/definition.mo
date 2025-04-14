import Sdk "mo:openchat-bot-sdk";

module {
    public func handler(commands : [Sdk.Definition.Command]) : Sdk.Http.QueryHandler {
        let definition : Sdk.Definition.Bot = {
            description = "A very simple bot that says hello to the caller";
            commands = commands;
            autonomous_config = null;
        };

        let response = Sdk.Http.ResponseBuilder()
            .withAllowHeaders()
            .withJson(Sdk.Definition.serialize(definition))
            .build();

        func(_ : Sdk.Http.Request) : Sdk.Http.Response {
            response;
        };
    };
};
