import Array "mo:base/Array";
import Json "mo:json";
import Permissions "permissions";
import Serialize "../common/serialization";

module {
    public type BotPermissions = Permissions.BotPermissions;    

    public type BotDefinition = {
        description : Text;
        commands : [BotCommandDefinition];
        autonomousConfig : ?AutonomousConfig;
    };

    public type AutonomousConfig = {
        permissions : ?BotPermissions;
        syncApiKey : Bool;
    };

    public type BotCommandDefinition = {
        name : Text;
        description : Text;
        placeholder : ?Text;
        params : [BotCommandParam];
        permissions : BotPermissions;
        defaultRole: ?ChatRole;
        directMessages: ?Bool;
    };

    public type BotCommandParam = {
        name : Text;
        description : Text;
        placeholder : ?Text;
        required : Bool;
        paramType : BotCommandParamType;
    };

    public type BotCommandParamType = {
        #userParam;
        #booleanParam;
        #stringParam : StringParam;
        #integerParam : IntegerParam;
        #decimalParam : DecimalParam;
        #dateTimeParam : DateTimeParam;
    };

    public type StringParam = {
        minLength : Nat;
        maxLength : Nat;
        choices : [BotCommandOptionChoice<Text>];
        multiLine : Bool;
    };

    public type IntegerParam = {
        minValue : Int;
        maxValue : Int;
        choices : [BotCommandOptionChoice<Int>];
    };

    public type DecimalParam = {
        minValue : Float;
        maxValue : Float;
        choices : [BotCommandOptionChoice<Float>];
    };

    public type DateTimeParam = {
        futureOnly : Bool;
    };

    public type BotCommandOptionChoice<T> = {
        name : Text;
        value : T;
    };

    public type AuthToken = {
        #jwt : Text;
        #apiKey : Text;
    };

    public type ChatRole = {
        #owner;
        #admin;
        #moderator;
        #participant;
    };

    public func serialize(definition : BotDefinition) : Json.Json {
        var fields = [
            ("description", #string(definition.description)),
            ("commands", Serialize.arrayOfValues(definition.commands, serializeBotCommand)),
        ];
        switch (definition.autonomousConfig) {
            case (null) ();
            case (?config) fields := Array.append(fields, [("autonomous_config", serializeAutonomousConfig(config))]);
        };

        #object_(fields);
    };

    private func serializeAutonomousConfig(config : AutonomousConfig) : Json.Json {
        var fields : [(Text, Json.Json)] = [
            ("sync_api_key", #bool(config.syncApiKey)),
        ];
        switch (config.permissions) {
            case (null) ();
            case (?permissions) fields := Array.append(fields, [("permissions", Permissions.serializeBotPermissions(permissions))]);
        };

        #object_(fields);
    };

    private func serializeBotCommand(command : BotCommandDefinition) : Json.Json {
        var fields : [(Text, Json.Json)] = [
            ("name", #string(command.name)),
            ("description", #string(command.description)),
            ("params", Serialize.arrayOfValues(command.params, serializeBotCommandParam)),
            ("permissions", Permissions.serializeBotPermissions(command.permissions)),
        ];
        switch (command.placeholder) {
            case (null) ();
            case (?placeholder) fields := Array.append(fields, [("placeholder", #string(placeholder))]);
        };
        switch (command.defaultRole) {
            case (null) ();
            case (?default_role) fields := Array.append(fields, [("default_role", serializeChatRole(default_role))]);
        };
        switch (command.directMessages) {
            case (null) ();
            case (?direct_messages) fields := Array.append(fields, [("direct_messages", #bool(direct_messages))]);
        };

        #object_(fields);
    };

    private func serializeChatRole(chat_role : ChatRole) : Json.Json {
        switch (chat_role) {
            case (#owner) #string("Owner");
            case (#admin) #string("Admin");
            case (#moderator) #string("Moderator");
            case (#participant) #string("Participant");
        };
    };

    private func serializeBotCommandParam(param : BotCommandParam) : Json.Json {
        var fields : [(Text, Json.Json)] = [
            ("name", #string(param.name)),
            ("description", #string(param.description)),
            ("required", #bool(param.required)),
            ("param_type", serializeParamType(param.paramType)),
        ];
        switch (param.placeholder) {
            case (null) ();
            case (?placeholder) fields := Array.append(fields, [("placeholder", #string(placeholder))]);
        };

        #object_(fields);
    };

    private func serializeParamType(paramType : BotCommandParamType) : Json.Json {
        switch (paramType) {
            case (#userParam) #string("UserParam");
            case (#booleanParam) #string("BooleanParam");
            case (#stringParam(strParam)) #object_([("StringParam", serializeStringParam(strParam))]);
            case (#integerParam(numParam)) #object_([("IntegerParam", serializeIntegerParam(numParam))]);
            case (#decimalParam(decParam)) #object_([("DecimalParam", serializeDecimalParam(decParam))]);
            case (#dateTimeParam(dateTimeParam)) #object_([("DateTimeParam", serializeDateTimeParam(dateTimeParam))]);
        };
    };

    private func serializeStringParam(param : StringParam) : Json.Json {
        let choiceSerializer = func(choice : BotCommandOptionChoice<Text>) : Json.Json = serializeChoice<Text>(choice.name, #string(choice.value));
        #object_([
            ("min_length", #number(#int(param.minLength))),
            ("max_length", #number(#int(param.maxLength))),
            ("choices", Serialize.arrayOfValues(param.choices, choiceSerializer)),
            ("multi_line", #bool(param.multiLine)),
        ]);
    };

    private func serializeIntegerParam(param : IntegerParam) : Json.Json {
        let choiceSerializer = func(choice : BotCommandOptionChoice<Int>) : Json.Json = serializeChoice<Int>(choice.name, #number(#int(choice.value)));
        #object_([
            ("min_value", #number(#int(param.minValue))),
            ("max_value", #number(#int(param.maxValue))),
            ("choices", Serialize.arrayOfValues(param.choices, choiceSerializer)),
        ]);
    };

    private func serializeDecimalParam(param : DecimalParam) : Json.Json {
        let choiceSerializer = func(choice : BotCommandOptionChoice<Float>) : Json.Json = serializeChoice<Float>(choice.name, #number(#float(choice.value)));
        #object_([
            ("min_value", #number(#float(param.minValue))),
            ("max_value", #number(#float(param.maxValue))),
            ("choices", Serialize.arrayOfValues(param.choices, choiceSerializer)),
        ]);
    };

    private func serializeDateTimeParam(param : DateTimeParam) : Json.Json {
        #object_([
            ("future_only", #bool(param.futureOnly)),
        ]);
    };

    private func serializeChoice<T>(name : Text, value : Json.Json) : Json.Json {
        #object_([
            ("name", #string(name)),
            ("value", value),
        ]);
    };
}