import Nat32 "mo:base/Nat32";
import Nat "mo:base/Nat";
import Option "mo:base/Option";
import Sdk "mo:openchat-bot-sdk";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";
import UrlKit "mo:url-kit";

module {
    public func execute(request : Sdk.Http.Request, client : Sdk.OpenChat.AutonomousClient) : async Sdk.Http.Response {
        let #ok url = UrlKit.fromText(request.url) else {
            return ResponseBuilder.badRequest("Invalid URL");
        };

        // Try to extract a channel ID from the query string
        let ?channelId = UrlKit.getQueryParam(url, "channel")
            |> Option.map(_, Nat.fromText)
            |> Option.flatten(_)
            |> Option.map(_, Nat32.fromNat) 
        else {
            return ResponseBuilder.badRequest("Channel ID not provided in query string");
        };

        let result = await client.deleteChannel(channelId).execute();

        switch (result) {
            case (#ok(#Success)) return ResponseBuilder.success();
            case (#err(_, text)) ResponseBuilder.internalServerError("Failed to delete channel: " #text);
            case other ResponseBuilder.internalServerError(debug_show(other));
        };
    };
};