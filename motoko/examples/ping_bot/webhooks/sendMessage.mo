import Nat64 "mo:base/Nat64";
import Text "mo:base/Text";
import Sdk "mo:openchat-bot-sdk";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";

module {
    public func execute(request : Sdk.Http.Request, client : Sdk.OpenChat.AutonomousClient) : async Sdk.Http.Response {
        let ?message = Text.decodeUtf8(request.body) else {
            return ResponseBuilder.badRequest("Invalid UTF-8 encoding");
        };

        let result = await client.sendTextMessage(message).execute();

        switch (result) {
            case (#ok(#Success res)) return ResponseBuilder.text(200, Nat64.toText(res.message_id));
            case (#err(_, text)) ResponseBuilder.internalServerError("Failed to send message: " #text);
            case other ResponseBuilder.internalServerError(debug_show(other));
        };
    };
};