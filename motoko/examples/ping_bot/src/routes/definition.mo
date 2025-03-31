import Definition "../sdk/api/bot/definition";
import Http "../sdk/http";
import Router "../sdk/http/router";
import ResponseBuilder "../sdk/http/response_builder";

module {
    public func handler() : Router.QueryHandler {
        let definition : Definition.BotDefinition = {
            description = "Provides a ping command and an echo command";
            commands = [{
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
            }, {
                name = "echo";
                description = "Echos the given text";
                placeholder = null;
                params = [{
                    name = "text";
                    description = "The text to echo";
                    placeholder = null;
                    required = true;
                    param_type = #StringParam {
                        max_length = 1000;
                        min_length = 1;
                        multi_line = true;
                        choices = [];
                    };
                }];
                permissions = {
                    community = [];
                    chat = [];
                    message =[#Text, #Giphy];
                };
                default_role = null;
                direct_messages = ?true;
            }];
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
            .with_json(Definition.serialize(definition))
            .build();

        func (_ : Http.Request) : Http.Response {
            response;
        };
    };
}