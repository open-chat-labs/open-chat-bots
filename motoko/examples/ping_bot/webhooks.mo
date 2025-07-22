import Text "mo:base/Text";
import HttpParser "mo:http-parser";
import Sdk "mo:openchat-bot-sdk";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";
import HttpInternal "mo:openchat-bot-sdk/http";
import ActionContext "mo:openchat-bot-sdk/api/bot/actionContext";
import Client "mo:openchat-bot-sdk/client";
import ActionScope "mo:openchat-bot-sdk/api/common/actionScope";

import S "state";
import CreateChannel "webhooks/createChannel";
import DeleteChannel "webhooks/deleteChannel";
import SendMessage "webhooks/sendMessage";

module {
    public func handler(state : S.State) : Sdk.Http.UpdateHandler {
        func (request: Sdk.Http.Request) : async Sdk.Http.Response {
            let ?apiKey = HttpInternal.requestHeader(request, "x-oc-api-key") else {
                return ResponseBuilder.text(400, "x-oc-api-key not found");
            };

            let ?(apiGateway, location) = state.apiKeyRegistry.get(apiKey) else {
                return ResponseBuilder.text(401, "ApiKey not in registry");
            };

            let client = let client = Client.AutonomousClient({
                apiGateway;
                scope = ActionScope.fromLocation(location);
                jwt = null;
                messageId = null;
                thread = null;
            });

            let lowerPath = HttpParser.parse(request) |> _.url.path.original |> Text.toLowercase _;

            switch (Text.stripStart(lowerPath, #text "/webhook/")) {
                case (?"create-channel") { await CreateChannel.execute(request, client) };
                case (?"delete-channel") { await DeleteChannel.execute(request, client) };
                case (?"send-message") { await SendMessage.execute(request, client) };
                case _ ResponseBuilder.notFound();
            };
        };
    };
};