import Text "mo:base/Text";
import Sdk "mo:openchat-bot-sdk";
import CommandScope "mo:openchat-bot-sdk/api/common/commandScope";
import CommandResponse "mo:openchat-bot-sdk/api/bot/commandResponse";

module {
    public func build() : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute;
        };
    };

    func execute(client : Sdk.OpenChat.Client, context : Sdk.Command.Context) : async Sdk.Command.Result {
        let ?chatDetails = CommandScope.chatDetails(context.scope) else return #err "Expected Chat scope";

        let response = await client   
            .chatSummary()
            .execute();

        let result = switch (response) {
            case (#ok(#Success res)) res;
            case (#ok(other)) return #err("Error calling bot_chat_summary: " # debug_show(other));
            case (#err(_, text)) return #err("C2C error calling bot_chat_summary: " # text);
        };

        let text = debug_show(result) |> Text.replace(_, #text "\"", "&quot;");

        let message = CommandResponse.EphemeralMessageBuilder(#Text { text }, chatDetails.message_id).build();

        return #ok { message = ?message };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "chat_summary";
            description = ?"This will give a summary of the current chat";
            placeholder = ?"Please wait";
            params = [];
            permissions = {
                community = [];
                chat = [#ReadSummary];
                message = [];
            };
            default_role = null;
            direct_messages = null;
        };
    };
};
