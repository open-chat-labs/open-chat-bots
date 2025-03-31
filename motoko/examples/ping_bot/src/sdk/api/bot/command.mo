import Int32 "mo:base/Int32";
import Nat64 "mo:base/Nat64";
import Result "mo:base/Result";
import Int64 "mo:base/Int64";
import Json "mo:json";
import Serialize "../common/serialization";
import M "../common/message_content";
import T "../common/base";
import MessageContent "../common/message_content";
import Deserialize "../common/deserialization";

module {
    public type Command = {
        name : Text;
        args : [CommandArg];
        initiator : T.UserId;
        meta : ?CommandMeta;
    };

    public type CommandMeta = {
        timezone : Text; // IANA timezone e.g. "Europe/London"
        language : Text; // The language selected in OpenChat e.g. "en"
    };

    public type CommandArg = {
        name : Text;
        value : CommandArgValue;
    };

    public type CommandArgValue = {
        #String : Text;
        #Integer : Int64;
        #Decimal : Float;
        #Boolean : Bool;
        #User : T.UserId;
        #Datetime : T.TimestampMillis;
    };

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
        #Invalid : Text;
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
        id : T.MessageId;
        content : M.MessageContentInitial;
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

    public func deserialize(commandJson : Json.Json) : Result.Result<Command, Text> {
        Des.deserializeCommand(commandJson);
    };  

    public class EphemeralMessageBuilder(content : M.MessageContentInitial, messageId : T.MessageId) = this {
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
                case (#Invalid(invalid)) Serialize.variantWithValue("Invalid", #string(invalid));
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

    module Des {
        public func deserializeCommand(commandJson : Json.Json) : Result.Result<Command, Text> {
            let commandName = switch (Json.getAsText(commandJson, "name")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'name' field: " # debug_show (e));
            };
            let commandArgs : [CommandArg] = switch (Json.getAsArray(commandJson, "args")) {
                case (#ok(args)) switch (Deserialize.arrayOfValues(args, deserializeCommandArg)) {
                    case (#ok(v)) v;
                    case (#err(e)) return #err("Invalid 'args' field: " # e);
                };
                case (#err(e)) return #err("Invalid 'args' field: " # debug_show (e));
            };
            let initiator = switch (Deserialize.principal(commandJson, "initiator")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'initiator' field: " # debug_show (e));
            };
            let meta : ?CommandMeta = switch (Json.get(commandJson, "meta")) {
                case (?meta) switch (deserializeCommandMeta(meta)) {
                    case (#ok(v)) ?v;
                    case (#err(e)) return #err("Invalid 'meta' field: " # e);
                };
                case (null) null;
            };
            #ok({
                name = commandName;
                args = commandArgs;
                initiator = initiator;
                meta = meta;
            });
        };

        private func deserializeCommandMeta(metaJson : Json.Json) : Result.Result<CommandMeta, Text> {
            let timezone = switch (Json.getAsText(metaJson, "timezone")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'timezone' field: " # debug_show (e));
            };
            let language = switch (Json.getAsText(metaJson, "language")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'language' field: " # debug_show (e));
            };
            #ok({
                timezone = timezone;
                language = language;
            });
        };

        private func deserializeCommandArg(json : Json.Json) : Result.Result<CommandArg, Text> {
            let name = switch (Json.getAsText(json, "name")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'name' field: " # debug_show (e));
            };
            let (valueType, valueTypeValue) = switch (Json.getAsObject(json, "value")) {
                case (#ok(valueObj)) valueObj[0];
                case (#err(e)) return #err("Invalid 'value' field: " # debug_show (e));
            };
            let value : CommandArgValue = switch (valueType) {
                case ("String") switch (Json.getAsText(valueTypeValue, "")) {
                    case (#ok(string)) #String(string);
                    case (#err(e)) return #err("Invalid 'String' value in CommandArg: " # debug_show (e));
                };
                case ("Boolean") switch (Json.getAsBool(valueTypeValue, "")) {
                    case (#ok(bool)) #Boolean(bool);
                    case (#err(e)) return #err("Invalid 'Boolean' value in CommandArg: " # debug_show (e));
                };
                case ("Integer") switch (Json.getAsInt(valueTypeValue, "")) {
                    case (#ok(int)) #Integer(Int64.fromInt(int));
                    case (#err(e)) return #err("Invalid 'Integer' value in CommandArg: " # debug_show (e));
                };
                case ("Decimal") switch (Json.getAsFloat(valueTypeValue, "")) {
                    case (#ok(float)) #Decimal(float);
                    case (#err(e)) return #err("Invalid 'Decimal' value in CommandArg: " # debug_show (e));
                };
                case ("User") switch (Deserialize.principal(valueTypeValue, "")) {
                    case (#ok(p)) #User(p);
                    case (#err(e)) return #err("Invalid 'User' value in CommandArg: " # debug_show (e));
                };
                case (_) return #err("Invalid value variant type: " # valueType);
            };
            #ok({
                name = name;
                value = value;
            });
        };        
    };
}