import Sdk "mo:openchat-bot-sdk";

module {
    public func handler(commands : [Sdk.Definition.Command]) : Sdk.Http.QueryHandler {
        let definition : Sdk.Definition.Bot = {
            description = "A bot that welcomes users to a group or community with a custom message.";
            commands = commands;
            autonomous_config = ?{
                permissions = ?{
                    community = [#ReadMembership];
                    chat = [#ReadMembership];
                    message = [#Text];
                };
            };
            default_subscriptions = ?{
                community = [#MemberJoined];
                chat = [#MembersJoined];
            };
            restricted_locations = ?[#Community, #Group];
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
