import Nat32 "mo:base/Nat32";
import Nat64 "mo:base/Nat64";
import Nat "mo:base/Nat";
import Text "mo:base/Text";
import Sdk "mo:openchat-bot-sdk";
import Option "mo:base/Option";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";
import UrlKit "mo:url-kit";

module {
    public func execute(request : Sdk.Http.Request, client : Sdk.OpenChat.AutonomousClient) : async Sdk.Http.Response {
        // Try to extract a channel ID from the query string
        let #ok url = UrlKit.fromText(request.url) else return ResponseBuilder.badRequest("Invalid URL");
        let channelId = UrlKit.getQueryParam(url, "channel")
            |> Option.map(_, Nat.fromText)
            |> Option.flatten(_)
            |> Option.map(_, Nat32.fromNat);        

        // Take the message text from the request body
        let ?message = Text.decodeUtf8(request.body) else {
            return ResponseBuilder.badRequest("Invalid UTF-8 encoding");
        };

        let result = await client
            .sendTextMessage(message)
            .inChannel(channelId)
            .execute();

        switch (result) {
            case (#ok(#Success res)) return ResponseBuilder.text(200, Nat64.toText(res.message_id));
            case (#err(_, text)) ResponseBuilder.internalServerError("Failed to send message: " #text);
            case other ResponseBuilder.internalServerError(debug_show(other));
        };
    };
};