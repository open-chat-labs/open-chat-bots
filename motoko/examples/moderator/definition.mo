import Sdk "mo:openchat-bot-sdk";

module {
    public func handler() : Sdk.Http.QueryHandler {
        let definition : Sdk.Definition.Bot = {
            description = "This is a very basic example moderation bot which will auto delete any messages containing words in its banned list.";
            commands = [];
            autonomous_config = ?{
                permissions = ?{
                    community = [];
                    chat = [#ReadMessages, #DeleteMessages];
                    message = [#Text];
                };
            };
            default_subscriptions = ?{
                community = [];
                chat = [#Message, #MessageEdited];
            };
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
