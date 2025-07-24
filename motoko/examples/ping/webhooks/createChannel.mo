import Nat32 "mo:base/Nat32";
import Text "mo:base/Text";
import Json "mo:json";
import Sdk "mo:openchat-bot-sdk";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";

module {
    type Args = {
        channelName: Text;
        isPublic: Bool;
    };
    
    public func execute(request : Sdk.Http.Request, client : Sdk.OpenChat.AutonomousClient) : async Sdk.Http.Response {
        let ?body = Text.decodeUtf8(request.body) else {
            return ResponseBuilder.badRequest("Invalid UTF-8 encoding");
        };

        let ?args = deserializeArgs(body) else {
            return ResponseBuilder.badRequest("Invalid JSON args");
        };

        let result = await client.createChannel(args.channelName, args.isPublic).execute();

        switch (result) {
            case (#ok(#Success res)) return ResponseBuilder.text(200, Nat32.toText(res.channel_id));
            case (#ok(other)) ResponseBuilder.internalServerError(debug_show(other));
            case (#err(_, text)) ResponseBuilder.internalServerError("Failed to create channel: " #text);
        };
    };

    func deserializeArgs(text: Text) : ?Args {
        let #ok(json) = Json.parse(text) else {
            return null;
        };

        let #ok(channelName) = Json.getAsText(json, "channelName") else {
            return null;
        };

        let #ok(isPublic) = Json.getAsBool(json, "isPublic") else {
            return null;
        };

        return ?{ channelName = channelName; isPublic = isPublic };
    };
};