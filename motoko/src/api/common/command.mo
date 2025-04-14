import Array "mo:base/Array";
import Debug "mo:base/Debug";
import Int64 "mo:base/Int64";
import Nat64 "mo:base/Nat64";
import Option "mo:base/Option";
import Result "mo:base/Result";
import Json "mo:json";

import B "../common/base";
import Deserialize "../common/deserialization";

module {
    public type Command = {
        name : Text;
        args : [CommandArg];
        initiator : B.UserId;
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
        #User : B.UserId;
        #DateTime : B.TimestampMillis;
    };

    public func argText(command : Command, name : Text) : Text {
        let ?value = maybeArgText(command, name) else Debug.trap("Command arg not found");
        value;
    };

    public func maybeArgText(command : Command, name : Text) : ?Text {
        switch (getArgValue(command, name)) {
            case (?#String(v)) ?v;
            case _ null;
        };
    };

    public func argInt(command : Command, name : Text) : Int {
        let ?value = maybeArgInt(command, name) else Debug.trap("Command arg not found");
        value;
    };

    public func maybeArgInt(command : Command, name : Text) : ?Int {
        switch (getArgValue(command, name)) {
            case (?#Integer(v)) ?Int64.toInt(v);
            case _ null;
        };
    };

    public func argFloat(command : Command, name : Text) : Float {
        let ?value = maybeArgFloat(command, name) else Debug.trap("Command arg not found");
        value;
    };

    public func maybeArgFloat(command : Command, name : Text) : ?Float {
        switch (getArgValue(command, name)) {
            case (?#Decimal(v)) ?v;
            case _ null;
        };
    };

    public func argBool(command : Command, name : Text) : Bool {
        let ?value = maybeArgBool(command, name) else Debug.trap("Command arg not found");
        value;
    };

    public func maybeArgBool(command : Command, name : Text) : ?Bool {
        switch (getArgValue(command, name)) {
            case (?#Boolean(v)) ?v;
            case _ null;
        };
    };

    public func argUser(command : Command, name : Text) : B.UserId {
        let ?value = maybeArgUser(command, name) else Debug.trap("Command arg not found");
        value;
    };

    public func maybeArgUser(command : Command, name : Text) : ?B.UserId {
        switch (getArgValue(command, name)) {
            case (?#User(v)) ?v;
            case _ null;
        };
    };

    public func argTimestamp(command : Command, name : Text) : B.TimestampMillis {
        let ?value = maybeArgTimestamp(command, name) else Debug.trap("Command arg not found");
        value;
    };

    public func maybeArgTimestamp(command : Command, name : Text) : ?B.TimestampMillis {
        switch (getArgValue(command, name)) {
            case (?#DateTime(v)) ?v;
            case _ null;
        };
    };

    public func timezone(command : Command) : Text {
        Option.map(command.meta, func(meta : CommandMeta) : Text { meta.timezone })
        |> Option.get(_, "UTC");
    };

    public func language(command : Command) : Text {
        Option.map(command.meta, func(meta : CommandMeta) : Text { meta.language })
        |> Option.get(_, "en");
    };

    public func deserialize(commandJson : Json.Json) : Result.Result<Command, Text> {
        Des.deserializeCommand(commandJson);
    };

    func getArgValue(command : Command, name : Text) : ?CommandArgValue {
        Array.find(command.args, func(arg : CommandArg) : Bool { arg.name == name })
        |> Option.map(_, func(arg : CommandArg) : CommandArgValue { arg.value });
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
                case ("DateTime") switch (Json.getAsInt(valueTypeValue, "")) {
                    case (#ok(int)) #DateTime(Nat64.fromIntWrap(int));
                    case (#err(e)) return #err("Invalid 'DateTime' value in CommandArg: " # debug_show (e));
                };
                case (_) return #err("Invalid value variant type: " # valueType);
            };
            #ok({
                name = name;
                value = value;
            });
        };
    };
};
