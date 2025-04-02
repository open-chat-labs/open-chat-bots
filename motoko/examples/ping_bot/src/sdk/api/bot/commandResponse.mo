import Int32 "mo:base/Int32";
import Nat64 "mo:base/Nat64";
import Json "mo:json";
import Serialize "../common/serialization";
import B "../common/base";
import MessageContent "../common/messageContent";

module {
    public type Response = {
        #Success : SuccessResult;
        #BadRequest : BadRequestResult;
        #InternalError : InternalErrorResult;
    };

    public type BadRequestResult = {
        #AccessTokenNotFound;
        #AccessTokenInvalid : Text;
        #AccessTokenExpired;
        #CommandNotFound;
        #ArgsInvalid;
    };

    public type InternalErrorResult = {
        #CommandError : Text;
        #CanisterError : CanisterError;
        #C2CError : C2CError;
    };

    public type CanisterError = {
        #NotAuthorized;
        #Frozen;
        #Other : Text;
    };

    public type C2CError = (Int32, Text);

    public type SuccessResult = {
        message : ?Message;
    };

    public type Message = {
        id : B.MessageId;
        content : MessageContent.MessageContentInitial;
        finalised : Bool;
        block_level_markdown : Bool;
        ephemeral : Bool;
    };

    public func serializeSuccess(success : SuccessResult) : Json.Json {
        Ser.serializeSuccess(success);
    };

    public func serializeBadRequest(badRequest : BadRequestResult) : Json.Json {
        Ser.serializeBadRequest(badRequest);
    };

    public func serializeInternalError(error : InternalErrorResult) : Json.Json {
        Ser.serializeInternalError(error);
    };

    public class EphemeralMessageBuilder(content : MessageContent.MessageContentInitial, messageId : B.MessageId) = this {
        var blockLevelMarkdown : Bool = false;

        public func withBlockLevelMarkdown(value : Bool) : EphemeralMessageBuilder {
            blockLevelMarkdown := value;
            this;
        };

        public func build() : Message {
            {
                id = messageId;
                content = content;
                finalised = true;
                block_level_markdown = blockLevelMarkdown;
                ephemeral = true;
            };
        };
    };

    module Ser {
        public func serializeSuccess(success : SuccessResult) : Json.Json {
            let fields : [(Text, Json.Json)] = switch (success.message) {
                case (null) [];
                case (?message) [("message", serializeMessage(message))];
            };
            #object_(fields);
        };

        public func serializeBadRequest(badRequest : BadRequestResult) : Json.Json {
            switch (badRequest) {
                case (#AccessTokenNotFound) #string("AccessTokenNotFound");
                case (#AccessTokenInvalid(reason)) Serialize.variantWithValue("AccessTokenInvalid", #string(reason));
                case (#AccessTokenExpired) #string("AccessTokenExpired");
                case (#CommandNotFound) #string("CommandNotFound");
                case (#ArgsInvalid) #string("ArgsInvalid");
            };
        };

        public func serializeInternalError(error : InternalErrorResult) : Json.Json {
            switch (error) {
                case (#CommandError(invalid)) Serialize.variantWithValue("CommandError", #string(invalid));
                case (#CanisterError(canisterError)) Serialize.variantWithValue("CanisterError", serializeCanisterError(canisterError));
                case (#C2CError((code, message))) Serialize.variantWithValue("C2CError", #array([#number(#int(Int32.toInt(code))), #string(message)]));
            };
        };

        func serializeCanisterError(canisterError : CanisterError) : Json.Json {
            switch (canisterError) {
                case (#NotAuthorized) #string("NotAuthorized");
                case (#Frozen) #string("Frozen");
                case (#Other(other)) Serialize.variantWithValue("Other", #string(other));
            };
        };

        func serializeMessage(message : Message) : Json.Json {
            #object_([
                ("id", #string(Nat64.toText(message.id))),
                ("content", MessageContent.Ser.serialize(message.content)),
                ("finalised", #bool(message.finalised)),
                ("block_level_markdown", #bool(message.block_level_markdown)),
                ("ephemeral", #bool(message.ephemeral)),
            ]);
        };        
    };
}