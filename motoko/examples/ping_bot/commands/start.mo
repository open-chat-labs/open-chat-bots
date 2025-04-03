import Sdk "mo:openchat-bot-sdk";
import CommandResponse "mo:openchat-bot-sdk/api/bot/commandResponse";
import Scope "mo:openchat-bot-sdk/api/common/commandScope";
import Option "mo:base/Option";
import Float "mo:base/Float";

module {
    public func build() : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute;    
        };
    };

    func execute(client : Sdk.OpenChat.Client) : async Sdk.Command.Result {
        let n = Sdk.Command.Arg.maybeFloat(client.context.command, "n") |> Option.get(_, 1.0);
        let text = "Start pinging every " # Float.toText(n) # " seconds";    
        let ?messageId = Scope.messageId(client.context.scope) else return #err "Expected Chat scope";        

        let message = CommandResponse.EphemeralMessageBuilder(#Text { text = text }, messageId).build();

        return #ok { message = ?message };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "start";
            description = ?"Start pinging every n seconds";
            placeholder = null;
            params = [{
                name = "n";
                description = ?"The delay between pings in the range 1 - 10 seconds";
                placeholder = null;
                required = false;
                param_type = #DecimalParam {
                    max_value = 10.0;
                    min_value = 1.0;
                    choices = [];
                };
            }];
            permissions = {
                community = [];
                chat = [];
                message =[#Text];
            };
            default_role = ?#Admin;
            direct_messages = null;
        }
    };
}