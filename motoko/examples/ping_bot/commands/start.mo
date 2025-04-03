import Sdk "mo:openchat-bot-sdk";
import CommandHandler "mo:openchat-bot-sdk/commandHandler";
import CommandResponse "mo:openchat-bot-sdk/api/bot/commandResponse";
import Scope "mo:openchat-bot-sdk/api/common/commandScope";
import Option "mo:base/Option";
import Int "mo:base/Int";
import S "../state";
import Permissions "mo:openchat-bot-sdk/api/common/permissions";

module {
    public func build(state : S.State) : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute(state);
        };
    };

    func execute(state : S.State) : CommandHandler.Execute {
        func (client : Sdk.OpenChat.Client) : async Sdk.Command.Result {
            let n = Sdk.Command.Arg.maybeInt(client.context.command, "n") |> Option.get(_, 5) |> Int.abs(_);
            let ?chatDetails = Scope.chatDetails(client.context.scope) else return #err "Expected Chat scope";

            // Check if there is an API Key registered at the required scope and with the required permissions
            let text = switch (state
                .apiKeyRegistry
                .getKeyWithRequiredPermissions(
                    #Chat(chatDetails.chat),
                    Permissions.textOnly(),
                )) {
                case (?apiKeyRecord) {
                    let sub = {
                        chat = chatDetails.chat;
                        interval = n;
                        apiKey = apiKeyRecord.key;
                    };

                    let prefix = switch (state.subscriptions.set<system>(sub)) {
                        case false "Start pinging every";
                        case true "Update ping interval to";
                    };

                    prefix # " " # Int.toText(n) # " seconds";                    
                };
                case null {
                    "You must first register an API key for this chat and grant the 'send text message' permission";
                };
            };

            let message = CommandResponse.EphemeralMessageBuilder(#Text { text = text }, chatDetails.message_id).build();

            return #ok { message = ?message };
        };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "start";
            description = ?"Start pinging every n seconds";
            placeholder = null;
            params = [{
                name = "n";
                description = ?"The delay in seconds between pings or 5 if undefined";
                placeholder = null;
                required = false;
                param_type = #IntegerParam {
                    max_value = 1000;
                    min_value = 2;
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