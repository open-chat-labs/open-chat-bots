import Int32 "mo:base/Int32";
import Error "mo:base/Error";
import Debug "mo:base/Debug";
import Text "mo:base/Text";
import Json "mo:json";
import Env "../sdk/env";
import T "../sdk/lib";
import Http "../sdk/http";
import DER "../sdk/der";
import Jwt "../sdk/jwt";
import HttpRequest "../sdk/http/request";
import HttpResponse "../sdk/http/response";
import Serialize "../sdk/serialization";
import Message "../sdk/message";
import Router "state";

module {
    public type CommandResponse = {
        #success : SuccessResult;
        #badRequest : BadRequestResult;
        #internalError : InternalErrorResult;
    };

    public type SuccessResult = {
        message : ?Message.Message;
    };

    public type BadRequestResult = {
        #accessTokenNotFound;
        #accessTokenInvalid : Text;
        #accessTokenExpired;
        #commandNotFound;
        #argsInvalid;
    };

    public type InternalErrorResult = {
        #invalid : Text;
        #canisterError : CanisterError;
        #c2cError : C2CError;
    };

    public type CanisterError = {
        #notAuthorized;
        #frozen;
        #other : Text;
    };

    public type C2CError = (Int32, Text);

    func serializeSuccess(success : SuccessResult) : Json.Json {
        let fields : [(Text, Json.Json)] = switch (success.message) {
            case (null) [];
            case (?message) [("message", Message.serialize(message))];
        };
        #object_(fields);
    };

    func serializeBadRequest(badRequest : BadRequestResult) : Json.Json {
        switch (badRequest) {
            case (#accessTokenNotFound) #string("AccessTokenNotFound");
            case (#accessTokenInvalid(reason)) Serialize.variantWithValue("AccessTokenInvalid", #string(reason));
            case (#accessTokenExpired) #string("AccessTokenExpired");
            case (#commandNotFound) #string("CommandNotFound");
            case (#argsInvalid) #string("ArgsInvalid");
        };
    };

    func serializeInternalError(error : InternalErrorResult) : Json.Json {
        switch (error) {
            case (#invalid(invalid)) Serialize.variantWithValue("Invalid", #string(invalid));
            case (#canisterError(canisterError)) Serialize.variantWithValue("CanisterError", serializeCanisterError(canisterError));
            case (#c2cError((code, message))) Serialize.variantWithValue("C2CError", #array([#number(#int(Int32.toInt(code))), #string(message)]));
        };
    };

    func serializeCanisterError(canisterError : CanisterError) : Json.Json {
        switch (canisterError) {
            case (#notAuthorized) #string("NotAuthorized");
            case (#frozen) #string("Frozen");
            case (#other(other)) Serialize.variantWithValue("Other", #string(other));
        };
    };

    public func execute(request : Http.Request, opt_state : ?Router.State) : async Http.Response {
        let ?state = opt_state else {
            Debug.trap("State not found");
        };

        let (statusCode, response) : (Nat16, Json.Json) = try {
            let commandResponse = await execute_inner(request, state.ocPublicKey, Env.now());
            switch (commandResponse) {
                case (#success(success)) (200, serializeSuccess(success));
                case (#badRequest(badRequest)) (400, serializeBadRequest(badRequest));
                case (#internalError(error)) (500, serializeInternalError(error));
            };
        } catch (e) {
            (500, serializeInternalError(#invalid("Internal error: " # Error.message(e))));
        };

        HttpResponse.json(statusCode, response);
    };

    func execute_inner(request : Http.Request, ocPublicKey : DER.DerPublicKey, now : T.TimestampMillis) : async CommandResponse {
        let ?jwt = HttpRequest.header(request, "x-oc-jwt") else return #badRequest(#accessTokenNotFound);

        let result = switch (Jwt.verify(jwt, ocPublicKey, now)) {
            case (#err(#invalidSignature)) return #badRequest(#accessTokenInvalid("JWT: Invalid signature"));
            case (#err(#expired(_))) return #badRequest(#accessTokenExpired);
            case (#err(#parseError(reason))) return #badRequest(#accessTokenInvalid("JWT: Parse error: " # reason));
            case (#err(#invalidClaims)) return #badRequest(#accessTokenInvalid("JWT: Invalid claims"));
            case (#ok(data)) data;
        };

        let message : Message.Message = {
            id = 0;
            content = #text( { text = Json.stringify(result.data, null) |> escapeJsonString(_); });
            finalised = true;
            blockLevelMarkdown = false;
            ephemeral = true;
        };

        #success {
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