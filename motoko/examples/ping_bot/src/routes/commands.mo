import Error "mo:base/Error";
import Time "mo:base/Time";
import Debug "mo:base/Debug";
import Json "mo:json";
import Http "../sdk/http";
import ResponseBuilder "../sdk/http/responseBuilder";
import Router "../sdk/http/router";
import DER "../sdk/utils/der";
import Command "../sdk/api/bot/command";
import CommandContext "../sdk/api/bot/commandContext";
import Scope "../sdk/api/common/scope";

module {
    public func handler(ocPublicKey : DER.PublicKey) : Router.UpdateHandler {
        func (request: Http.Request) : async Http.Response {
            await execute(request, ocPublicKey, Time.now());
        };
    };

    func execute(request : Http.Request, ocPublicKey : DER.PublicKey, now : Time.Time) : async Http.Response {
        let (statusCode, response) : (Nat16, Json.Json) = try {
            let commandResponse = await executeInner(request, ocPublicKey, now);
            switch (commandResponse) {
                case (#Success(success)) (200, Command.serializeSuccess(success));
                case (#BadRequest(badRequest)) (400, Command.serializeBadRequest(badRequest));
                case (#InternalError(error)) (500, Command.serializeInternalError(error));
            };
        } catch (e) {
            (500, Command.serializeInternalError(#Invalid("Internal error: " # Error.message(e))));
        };

        ResponseBuilder.json(statusCode, response);
    };

    func executeInner(request : Http.Request, ocPublicKey : DER.PublicKey, now : Time.Time) : async Command.Response {
        let ?jwt = Http.requestHeader(request, "x-oc-jwt") else return #BadRequest(#AccessTokenNotFound);

        let context = switch (CommandContext.parseJwt(jwt, ocPublicKey, now)) {
            case (#err(#invalidSignature)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid signature"));
            case (#err(#expired(_))) return #BadRequest(#AccessTokenExpired);
            case (#err(#parseError(reason))) return #BadRequest(#AccessTokenInvalid("JWT: Parse error: " # reason));
            case (#err(#invalidClaims)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid claims"));
            case (#ok(data)) data;
        };

        let ?messageId = context.scope |> Scope.messageId(_) else Debug.trap("Invalid scope");

        let message = Command.EphemeralMessageBuilder(#Text( { text = context.command.name }), messageId)
            .withBlockLevelMarkdown(true)
            .build();

        #Success {
            message = ?message;
        };
    };
}