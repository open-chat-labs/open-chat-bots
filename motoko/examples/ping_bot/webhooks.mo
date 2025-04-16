import Text "mo:base/Text";
import HttpParser "mo:http-parser";
import Sdk "mo:openchat-bot-sdk";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";

import CreateChannel "webhooks/createChannel";
import DeleteChannel "webhooks/deleteChannel";
import SendMessage "webhooks/sendMessage";

module {
    public func handler(request: Sdk.Http.Request) : async Sdk.Http.Response {
        let client = switch (Sdk.buildAutonomousClient(request)) {
            case (#ok client) client;
            case (#err err) return err;
        };

        let lowerPath = HttpParser.parse(request) |> _.url.path.original |> Text.toLowercase _;

        switch (Text.stripStart(lowerPath, #text "/webhook/")) {
            case (?"create-channel") { await CreateChannel.execute(request, client) };
            case (?"delete-channel") { await DeleteChannel.execute(request, client) };
            case (?"send-message") { await SendMessage.execute(request, client) };
            case _ ResponseBuilder.notFound();
        };
    };
};