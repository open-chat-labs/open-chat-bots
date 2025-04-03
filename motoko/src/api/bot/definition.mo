import Array "mo:base/Array";
import Json "mo:json";
import Permissions "../common/permissions";
import Serialize "../common/serialization";
import B "../common/base";

module Definition {
    public type Permissions = Permissions.Permissions;    

    public type Bot = {
        description : Text;
        commands : [Command];
        autonomous_config : ?AutonomousConfig;
    };

    public type AutonomousConfig = {
        permissions : ?Permissions;
        sync_api_key : Bool;
    };

    public type Command = {
        name : Text;
        description : ?Text;
        placeholder : ?Text;
        params : [CommandParam];
        permissions : Permissions;
        default_role: ?B.ChatRole;
        direct_messages: ?Bool;
    };

    public type CommandParam = {
        name : Text;
        description : ?Text;
        placeholder : ?Text;
        required : Bool;
        param_type : CommandParamType;
    };

    public type CommandParamType = {
        #UserParam;
        #BooleanParam;
        #StringParam : StringParam;
        #IntegerParam : IntegerParam;
        #DecimalParam : DecimalParam;
        #DateTimeParam : DateTimeParam;
    };

    public type StringParam = {
        min_length : Nat;
        max_length : Nat;
        choices : [BotCommandOptionChoice<Text>];
        multi_line : Bool;
    };

    public type IntegerParam = {
        min_value : Int;
        max_value : Int;
        choices : [BotCommandOptionChoice<Int>];
    };

    public type DecimalParam = {
        min_value : Float;
        max_value : Float;
        choices : [BotCommandOptionChoice<Float>];
    };

    public type DateTimeParam = {
        future_only : Bool;
    };

    public type BotCommandOptionChoice<T> = {
        name : Text;
        value : T;
    };

    public func serialize(definition : Bot) : Json.Json {
        var fields = [
            ("description", #string(definition.description)),
            ("commands", Serialize.arrayOfValues(definition.commands, serializeBotCommand)),
        ];
        switch (definition.autonomous_config) {
            case (null) ();
            case (?config) fields := Array.append(fields, [("autonomous_config", serializeAutonomousConfig(config))]);
        };

        #object_(fields);
    };

    private func serializeAutonomousConfig(config : AutonomousConfig) : Json.Json {
        var fields : [(Text, Json.Json)] = [
            ("sync_api_key", #bool(config.sync_api_key)),
        ];
        switch (config.permissions) {
            case (null) ();
            case (?permissions) fields := Array.append(fields, [("permissions", Permissions.serialize(permissions))]);
        };

        #object_(fields);
    };

    private func serializeBotCommand(command : Command) : Json.Json {
        var fields : [(Text, Json.Json)] = [
            ("name", #string(command.name)),
            ("params", Serialize.arrayOfValues(command.params, serializeBotCommandParam)),
            ("permissions", Permissions.serialize(command.permissions)),
        ];
        switch (command.description) {
            case (null) ();
            case (?description) fields := Array.append(fields, [("description", #string(description))]);
        };
        switch (command.placeholder) {
            case (null) ();
            case (?placeholder) fields := Array.append(fields, [("placeholder", #string(placeholder))]);
        };
        switch (command.default_role) {
            case (null) ();
            case (?default_role) fields := Array.append(fields, [("default_role", serializeChatRole(default_role))]);
        };
        switch (command.direct_messages) {
            case (null) ();
            case (?direct_messages) fields := Array.append(fields, [("direct_messages", #bool(direct_messages))]);
        };

        #object_(fields);
    };

    private func serializeChatRole(chat_role : B.ChatRole) : Json.Json {
        switch (chat_role) {
            case (#Owner) #string("Owner");
            case (#Admin) #string("Admin");
            case (#Moderator) #string("Moderator");
            case (#Participant) #string("Participant");
        };
    };

    private func serializeBotCommandParam(param : CommandParam) : Json.Json {
        var fields : [(Text, Json.Json)] = [
            ("name", #string(param.name)),
            ("required", #bool(param.required)),
            ("param_type", serializeParamType(param.param_type)),
        ];
        switch (param.description) {
            case (null) ();
            case (?description) fields := Array.append(fields, [("description", #string(description))]);
        };
        switch (param.placeholder) {
            case (null) ();
            case (?placeholder) fields := Array.append(fields, [("placeholder", #string(placeholder))]);
        };

        #object_(fields);
    };

    private func serializeParamType(paramType : CommandParamType) : Json.Json {
        switch (paramType) {
            case (#UserParam) #string("UserParam");
            case (#BooleanParam) #string("BooleanParam");
            case (#StringParam(strParam)) #object_([("StringParam", serializeStringParam(strParam))]);
            case (#IntegerParam(numParam)) #object_([("IntegerParam", serializeIntegerParam(numParam))]);
            case (#DecimalParam(decParam)) #object_([("DecimalParam", serializeDecimalParam(decParam))]);
            case (#DateTimeParam(dateTimeParam)) #object_([("DateTimeParam", serializeDateTimeParam(dateTimeParam))]);
        };
    };

    private func serializeStringParam(param : StringParam) : Json.Json {
        let choiceSerializer = func(choice : BotCommandOptionChoice<Text>) : Json.Json = serializeChoice<Text>(choice.name, #string(choice.value));
        #object_([
            ("min_length", #number(#int(param.min_length))),
            ("max_length", #number(#int(param.max_length))),
            ("choices", Serialize.arrayOfValues(param.choices, choiceSerializer)),
            ("multi_line", #bool(param.multi_line)),
        ]);
    };

    private func serializeIntegerParam(param : IntegerParam) : Json.Json {
        let choiceSerializer = func(choice : BotCommandOptionChoice<Int>) : Json.Json = serializeChoice<Int>(choice.name, #number(#int(choice.value)));
        #object_([
            ("min_value", #number(#int(param.min_value))),
            ("max_value", #number(#int(param.max_value))),
            ("choices", Serialize.arrayOfValues(param.choices, choiceSerializer)),
        ]);
    };

    private func serializeDecimalParam(param : DecimalParam) : Json.Json {
        let choiceSerializer = func(choice : BotCommandOptionChoice<Float>) : Json.Json = serializeChoice<Float>(choice.name, #number(#float(choice.value)));
        #object_([
            ("min_value", #number(#float(param.min_value))),
            ("max_value", #number(#float(param.max_value))),
            ("choices", Serialize.arrayOfValues(param.choices, choiceSerializer)),
        ]);
    };

    private func serializeDateTimeParam(param : DateTimeParam) : Json.Json {
        #object_([
            ("future_only", #bool(param.future_only)),
        ]);
    };

    private func serializeChoice<T>(name : Text, value : Json.Json) : Json.Json {
        #object_([
            ("name", #string(name)),
            ("value", value),
        ]);
    };
}