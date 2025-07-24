import Int "mo:base/Int";
import Nat8 "mo:base/Nat8";
import Option "mo:base/Option";
import Sdk "mo:openchat-bot-sdk";
import CommandResponse "mo:openchat-bot-sdk/api/bot/commandResponse";
import Scope "mo:openchat-bot-sdk/api/common/commandScope";
import CommandHandler "mo:openchat-bot-sdk/commandHandler";

import S "../state";

module {
    public func build(state : S.State) : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute(state);
        };
    };

    func execute(state : S.State) : CommandHandler.Execute {
        func (client : Sdk.OpenChat.CommandClient) : async Sdk.Command.Result {
            let n = Sdk.Command.Arg.maybeInt(client.context.command, "n") |> Option.get(_, 5) |> Int.abs(_);
            let ?chatDetails = Scope.chatDetails(client.context.scope) else return #err "Expected Chat scope";

            let sub = {
                chat = chatDetails.chat;
                interval = n;
                apiGateway = client.context.apiGateway;
                iterations = 0 : Nat8;
            };

            let prefix = switch (state.subscriptions.set<system>(sub)) {
                case false "Start pinging every";
                case true "Update ping interval to";
            };

            let text = prefix # " " # Int.toText(n) # " seconds";                    

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