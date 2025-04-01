import Json "mo:json";
import Time "mo:base/Time";
import Der "utils/der";
import CommandHandler "commandHandler";
import Http "http";
import CommandResponse "api/bot/commandResponse";
import ResponseBuilder "http/responseBuilder";
import CommandContext "api/bot/commandContext";

module {
    public func execute(registry : CommandHandler.Registry, request : Http.Request, ocPublicKey : Der.PublicKey, now : Time.Time) : async Http.Response {
        let commandResponse = await executeInner(registry, request, ocPublicKey, now);

        let (statusCode, response) : (Nat16, Json.Json) = 
            switch (commandResponse) {
                case (#Success(success)) (200, CommandResponse.serializeSuccess(success));
                case (#BadRequest(badRequest)) (400, CommandResponse.serializeBadRequest(badRequest));
                case (#InternalError(error)) (500, CommandResponse.serializeInternalError(error));
            };

        ResponseBuilder.json(statusCode, response);            
    };

    func executeInner(registry : CommandHandler.Registry, request : Http.Request, ocPublicKey : Der.PublicKey, now : Time.Time) : async CommandResponse.Response {
        let ?jwt = Http.requestHeader(request, "x-oc-jwt") else return #BadRequest(#AccessTokenNotFound);

        let context = switch (CommandContext.parseJwt(jwt, ocPublicKey, now)) {
            case (#err(#invalidSignature)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid signature"));
            case (#err(#expired(_))) return #BadRequest(#AccessTokenExpired);
            case (#err(#parseError(reason))) return #BadRequest(#AccessTokenInvalid("JWT: Parse error: " # reason));
            case (#err(#invalidClaims)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid claims"));
            case (#ok(data)) data;
        };

        await registry.execute(context);
    };
}