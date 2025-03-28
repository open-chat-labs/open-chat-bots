import Definition "sdk/definition";
import Http "sdk/http";
import HttpResponse "sdk/http/response";

module {
    public func build() : Http.Response {
        let definition = {
            description = "Provides a ping command and an echo command";
            commands = [{
                name = "ping";
                description = "Responds with pong";
                placeholder = null;
                params = [];
                permissions = {
                    community = [];
                    chat = [];
                    message =[#text];
                };
                defaultRole = ?#admin;
                directMessages = null;
            }, {
                name = "echo";
                description = "Echos the given text";
                placeholder = null;
                params = [{
                    name = "text";
                    description = "The text to echo";
                    placeholder = null;
                    required = true;
                    paramType = #stringParam {
                        maxLength = 1000;
                        minLength = 1;
                        multiLine = true;
                        choices = [];
                    };
                }];
                permissions = {
                    community = [];
                    chat = [];
                    message =[#text, #giphy];
                };
                defaultRole = null;
                directMessages = ?true;
            }];
            autonomousConfig = ?{
                permissions = ?{
                    community = [];
                    chat = [];
                    message = [#text];
                };
                syncApiKey = true;
            };    
        };

        HttpResponse.Builder()
            .withAllowHeaders()
            .with_json(Definition.serialize(definition))
            .build();
    };
}