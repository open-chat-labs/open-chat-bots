import Error "mo:base/Error";
import Text "mo:base/Text";
import Time "mo:base/Time";
import Json "mo:json";
import Http "../sdk/http";
import DER "../sdk/utils/der";
import Jwt "../sdk/utils/jwt";
import HttpRequest "../sdk/http/request";
import HttpResponse "../sdk/http/response";
import Command "../sdk/api/bot/command";
import CommandSerializer "../sdk/api/bot/command.ser";

module {
    public func handler(ocPublicKey : DER.DerPublicKey) : Http.UpdateHandler {
        func (request: Http.Request) : async Http.Response {
            await execute(request, ocPublicKey, Time.now());
        };
    };

    func execute(request : Http.Request, ocPublicKey : DER.DerPublicKey, now : Time.Time) : async Http.Response {
        let (statusCode, response) : (Nat16, Json.Json) = try {
            let commandResponse = await execute_inner(request, ocPublicKey, now);
            switch (commandResponse) {
                case (#Success(success)) (200, CommandSerializer.success(success));
                case (#BadRequest(badRequest)) (400, CommandSerializer.badRequest(badRequest));
                case (#InternalError(error)) (500, CommandSerializer.internalError(error));
            };
        } catch (e) {
            (500, CommandSerializer.internalError(#Invalid("Internal error: " # Error.message(e))));
        };

        HttpResponse.json(statusCode, response);
    };

    func execute_inner(request : Http.Request, ocPublicKey : DER.DerPublicKey, now : Time.Time) : async Command.Response {
        let ?jwt = HttpRequest.header(request, "x-oc-jwt") else return #BadRequest(#AccessTokenNotFound);

        let result = switch (Jwt.verify(jwt, ocPublicKey, now)) {
            case (#err(#invalidSignature)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid signature"));
            case (#err(#expired(_))) return #BadRequest(#AccessTokenExpired);
            case (#err(#parseError(reason))) return #BadRequest(#AccessTokenInvalid("JWT: Parse error: " # reason));
            case (#err(#invalidClaims)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid claims"));
            case (#ok(data)) data;
        };

        let message : Command.Message = {
            id = 0;
            content = #Text( { text = Json.stringify(result.data, null) |> escapeJsonString(_); });
            finalised = true;
            blockLevelMarkdown = false;
            ephemeral = true;
        };

        #Success {
            message = ?message;
        };
    };

    func escapeJsonString(text : Text) : Text {
        var escaped = text;
        escaped := Text.replace(escaped, #char '\\', "\\\\"); // Backslash first
        escaped := Text.replace(escaped, #char '\"', "\\\"");
        escaped := Text.replace(escaped, #char '\n', "\\n");
        escaped := Text.replace(escaped, #char '\r', "\\r");
        escaped := Text.replace(escaped, #char '\t', "\\t");
        escaped;
    };
}