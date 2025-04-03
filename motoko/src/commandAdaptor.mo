import Json "mo:json";
import Der "utils/der";
import CommandHandler "commandHandler";
import Http "http";
import CommandResponse "api/bot/commandResponse";
import ResponseBuilder "http/responseBuilder";
import Base "api/common/base";

module {
    public func execute<S>(
        registry : CommandHandler.Registry, 
        request : Http.Request, 
        ocPublicKey : Der.PublicKey, 
        now : Base.TimestampMillis) 
    : async Http.Response {
        let commandResponse = await executeInner(registry, request, ocPublicKey, now);

        let (statusCode, response) : (Nat16, Json.Json) = 
            switch (commandResponse) {
                case (#Success(success)) (200, CommandResponse.serializeSuccess(success));
                case (#BadRequest(badRequest)) (400, CommandResponse.serializeBadRequest(badRequest));
                case (#InternalError(error)) (500, CommandResponse.serializeInternalError(error));
            };

        ResponseBuilder.json(statusCode, response);            
    };

    func executeInner<S>(
        registry : CommandHandler.Registry, 
        request : Http.Request, 
        ocPublicKey : Der.PublicKey, 
        now : Base.TimestampMillis) 
    : async CommandResponse.Response {
        let ?jwt = Http.requestHeader(request, "x-oc-jwt") else {
            return #BadRequest(#AccessTokenNotFound);
        };

        await registry.execute(jwt, ocPublicKey, now);
    };
}