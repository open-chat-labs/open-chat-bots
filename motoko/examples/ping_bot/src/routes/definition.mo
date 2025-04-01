import Definition "../sdk/api/bot/definition";
import Http "../sdk/http";
import Router "../sdk/http/router";
import ResponseBuilder "../sdk/http/responseBuilder";

module {
    public func handler(commands : [Definition.BotCommand]) : Router.QueryHandler {
        let definition : Definition.Bot = {
            description = "Provides a ping command and an echo command";
            commands = commands;
            autonomous_config = ?{
                permissions = ?{
                    community = [];
                    chat = [];
                    message = [#Text];
                };
                sync_api_key = true;
            };    
        };

        let response = ResponseBuilder.Builder()
            .withAllowHeaders()
            .withJson(Definition.serialize(definition))
            .build();

        func (_ : Http.Request) : Http.Response {
            response;
        };
    };
}