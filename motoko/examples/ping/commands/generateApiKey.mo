import BaseX "mo:base-x-encoder";
import Random "mo:base/Random";
import Chat "mo:openchat-bot-sdk/api/common/chat";
import CommandHandler "mo:openchat-bot-sdk/commandHandler";
import CommandScope "mo:openchat-bot-sdk/api/common/commandScope";
import CommandResponse "mo:openchat-bot-sdk/api/bot/commandResponse";
import Sdk "mo:openchat-bot-sdk";
import S "../state";

module {
    public func build(state : S.State) : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute(state);
        };
    };

    func execute(state : S.State) : CommandHandler.Execute {
        func (_client : Sdk.OpenChat.Client, context : Sdk.Command.Context) : async Sdk.Command.Result {
            let ?chatDetails = CommandScope.chatDetails(context.scope) else return #err "Expected Chat scope";
            let randomBlob = await Random.blob();
            let apiKey = BaseX.toBase64(randomBlob.vals(), #url { includePadding = false });
            let location = Chat.toLocation(chatDetails.chat);

            state.apiKeyRegistry.insert(apiKey, context.apiGateway, location);

            let (webhooks, scope) = switch (location) {
                case (#Community(_)) {
                    ("`created_channel`, `deleted_channel`, and `send_message` webhooks", "community")
                };
                case _ {
                    ("`send_message` webhook", "chat")
                }
            };

            let text = 
                "This API key allows an external system to call this bot's " # webhooks # " acting within this " # scope # ":\\n\\n```" 
                # apiKey # 
                "```\\n\\nMake sure to store this key somewhere secure and don't share it.";

            let message = CommandResponse.EphemeralMessageBuilder(#Text { text = text }, chatDetails.message_id).build();

            return #ok { message = ?message };
        };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "generate_api_key";
            description = ?"This will generate an api key which can be used by a 3rd party to call one of the webhooks";
            placeholder = ?"Please wait";
            params = [];
            permissions = {
                community = [];
                chat = [];
                message = [];
            };
            default_role = ?#Owner;
            direct_messages = null;
        };
    };
};
