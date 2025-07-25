import Sdk "mo:openchat-bot-sdk";

module {
    public func handler(commands : [Sdk.Definition.Command]) : Sdk.Http.QueryHandler {
        let definition : Sdk.Definition.Bot = {
            description = "Provides a handful of example commands";
            commands = commands;
            autonomous_config = ?{
                permissions = ?{
                    community = [#CreatePublicChannel, #CreatePrivateChannel];
                    chat = [];
                    message = [#Text];
                };
            };
            default_subscriptions = null;
            data_encoding = ?#Candid;
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
