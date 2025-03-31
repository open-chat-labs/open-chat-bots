import J "mo:json";
import Nat64 "mo:base/Nat64";
import Int32 "mo:base/Int32";
import M "../common/message_content";
import Serialize "../common/serialization";
import Command "command";

module {
    public func success(success : Command.SuccessResult) : J.Json {
        let fields : [(Text, J.Json)] = switch (success.message) {
            case (null) [];
            case (?message) [("message", serializeMessage(message))];
        };
        #object_(fields);
    };

    public func badRequest(badRequest : Command.BadRequestResult) : J.Json {
        switch (badRequest) {
            case (#accessTokenNotFound) #string("AccessTokenNotFound");
            case (#accessTokenInvalid(reason)) Serialize.variantWithValue("AccessTokenInvalid", #string(reason));
            case (#accessTokenExpired) #string("AccessTokenExpired");
            case (#commandNotFound) #string("CommandNotFound");
            case (#argsInvalid) #string("ArgsInvalid");
        };
    };

    public func internalError(error : Command.InternalErrorResult) : J.Json {
        switch (error) {
            case (#invalid(invalid)) Serialize.variantWithValue("Invalid", #string(invalid));
            case (#canisterError(canisterError)) Serialize.variantWithValue("CanisterError", serializeCanisterError(canisterError));
            case (#c2cError((code, message))) Serialize.variantWithValue("C2CError", #array([#number(#int(Int32.toInt(code))), #string(message)]));
        };
    };

    func serializeCanisterError(canisterError : Command.CanisterError) : J.Json {
        switch (canisterError) {
            case (#notAuthorized) #string("NotAuthorized");
            case (#frozen) #string("Frozen");
            case (#other(other)) Serialize.variantWithValue("Other", #string(other));
        };
    };

    func serializeMessage(message : Command.Message) : J.Json {
        #object_([
            ("id", #string(Nat64.toText(message.id))),
            ("content", M.serializeMessageContent(message.content)),
            ("finalised", #bool(message.finalised)),
        ]);
    };
}