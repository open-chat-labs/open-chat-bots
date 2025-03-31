import J "mo:json";
import Nat64 "mo:base/Nat64";
import Int32 "mo:base/Int32";
import Serialize "../common/serialization";
import MessageContentSerializer "../common/message_content.ser";
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
            case (#AccessTokenNotFound) #string("AccessTokenNotFound");
            case (#AccessTokenInvalid(reason)) Serialize.variantWithValue("AccessTokenInvalid", #string(reason));
            case (#AccessTokenExpired) #string("AccessTokenExpired");
            case (#CommandNotFound) #string("CommandNotFound");
            case (#ArgsInvalid) #string("ArgsInvalid");
        };
    };

    public func internalError(error : Command.InternalErrorResult) : J.Json {
        switch (error) {
            case (#Invalid(invalid)) Serialize.variantWithValue("Invalid", #string(invalid));
            case (#CanisterError(canisterError)) Serialize.variantWithValue("CanisterError", serializeCanisterError(canisterError));
            case (#C2CError((code, message))) Serialize.variantWithValue("C2CError", #array([#number(#int(Int32.toInt(code))), #string(message)]));
        };
    };

    func serializeCanisterError(canisterError : Command.CanisterError) : J.Json {
        switch (canisterError) {
            case (#NotAuthorized) #string("NotAuthorized");
            case (#Frozen) #string("Frozen");
            case (#Other(other)) Serialize.variantWithValue("Other", #string(other));
        };
    };

    func serializeMessage(message : Command.Message) : J.Json {
        #object_([
            ("id", #string(Nat64.toText(message.id))),
            ("content", MessageContentSerializer.messageContent(message.content)),
            ("finalised", #bool(message.finalised)),
        ]);
    };
}