import Nat32 "mo:base/Nat32";
import Text "mo:base/Text";
import Json "mo:json";
import Sdk "mo:openchat-bot-sdk";
import B "mo:openchat-bot-sdk/api/common/base";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";

module {
    type Args = {
        channelId: B.ChannelId;
    };
    
    public func execute(request : Sdk.Http.Request, client : Sdk.OpenChat.AutonomousClient) : async Sdk.Http.Response {
        let ?body = Text.decodeUtf8(request.body) else {
            return ResponseBuilder.badRequest("Invalid UTF-8 encoding");
        };

        let ?args = deserializeArgs(body) else {
            return ResponseBuilder.badRequest("Invalid JSON args");
        };

        let result = await client.deleteChannel(args.channelId).execute();

        switch (result) {
            case (#ok(#Success)) return ResponseBuilder.success();
            case (#err(_, text)) ResponseBuilder.internalServerError("Failed to delete channel: " #text);
            case other ResponseBuilder.internalServerError(debug_show(other));
        };
    };

    func deserializeArgs(text: Text) : ?Args {
        let #ok(json) = Json.parse(text) else {
            return null;
        };

        let #ok(channelId) = Json.getAsNat(json, "channelId") else {
            return null;
        };

        return ?{ channelId = Nat32.fromNat(channelId) };
    };
};