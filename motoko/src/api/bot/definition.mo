import Array "mo:base/Array";
import Json "mo:json";

import B "../common/base";
import E "../common/eventTypes";
import R "../common/chatRole";
import Permissions "../common/permissions";
import Serialize "../common/serialization";
import InstallationLocation "../common/installationLocation";

module Definition {
    public type Permissions = Permissions.Permissions;
    public type InstallationLocationType = InstallationLocation.InstallationLocationType;

    public type Bot = {
        description : Text;
        commands : [Command];
        autonomous_config : ?AutonomousConfig;
        default_subscriptions: ?BotSubscriptions;
        restricted_locations: ?[InstallationLocationType]
    };

    public type AutonomousConfig = {
        permissions : ?Permissions;
    };

    public type Command = {
        name : Text;
        description : ?Text;
        placeholder : ?Text;
        params : [CommandParam];
        permissions : Permissions;
        default_role : ?R.ChatRole;
        direct_messages : ?Bool;
    };

    public type CommandParam = {
        name : Text;
        description : ?Text;
        placeholder : ?Text;
        required : Bool;
        param_type : CommandParamType;
        // Shown only while an earlier param has one of the condition's values; shown always if null
        visible_when : ?CommandParamCondition;
    };

    // When OpenChat's form for a command shows a param, or one of a param's choices: while an
    // earlier param, a #StringParam with choices, has one of `values`, eg. a game's settings once
    // that game is chosen. A hidden param's arg isn't sent. An OpenChat which doesn't read
    // conditions shows every param and choice, so a bot still checks the args it's given.
    public type CommandParamCondition = {
        // An earlier param's name
        param : Text;
        // Its values which show this param or choice
        values : [Text];
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
        visible_when : ?CommandParamCondition;
    };

    public type  BotSubscriptions = {
        community : [E.CommunityEventType];
        chat : [E.ChatEventType];
    };

    public func serialize(definition : Bot) : Json.Json {
        var fields = [
            ("description", #string(definition.description)),
            ("commands", Serialize.arrayOfValues(definition.commands, serializeBotCommand)),
            ("data_encoding", #string("Candid")),
        ];
        switch (definition.autonomous_config) {
            case (null) ();
            case (?config) fields := Array.append(fields, [("autonomous_config", serializeAutonomousConfig(config))]);
        };
        switch (definition.default_subscriptions) {
            case (null) ();
            case (?config) fields := Array.append(fields, [("default_subscriptions", serializeDefaultSubscriptions(config))]);
        };
        switch (definition.restricted_locations) {
            case (null) ();
            case (?config) fields := Array.append(fields, [("restricted_locations", Serialize.arrayOfValues(config, serializeRestrictedLocationType))]);
        };

        #object_(fields);
    };

    private func serializeAutonomousConfig(config : AutonomousConfig) : Json.Json {
        var fields : [(Text, Json.Json)] = [];

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

    private func serializeChatRole(chat_role : R.ChatRole) : Json.Json {
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
        switch (param.visible_when) {
            case (null) ();
            case (?condition) fields := Array.append(fields, [("visible_when", serializeCondition(condition))]);
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
        let choiceSerializer = func(choice : BotCommandOptionChoice<Text>) : Json.Json = serializeChoice(choice.name, #string(choice.value), choice.visible_when);
        #object_([
            ("min_length", #number(#int(param.min_length))),
            ("max_length", #number(#int(param.max_length))),
            ("choices", Serialize.arrayOfValues(param.choices, choiceSerializer)),
            ("multi_line", #bool(param.multi_line)),
        ]);
    };

    private func serializeIntegerParam(param : IntegerParam) : Json.Json {
        let choiceSerializer = func(choice : BotCommandOptionChoice<Int>) : Json.Json = serializeChoice(choice.name, #number(#int(choice.value)), choice.visible_when);
        #object_([
            ("min_value", #number(#int(param.min_value))),
            ("max_value", #number(#int(param.max_value))),
            ("choices", Serialize.arrayOfValues(param.choices, choiceSerializer)),
        ]);
    };

    private func serializeDecimalParam(param : DecimalParam) : Json.Json {
        let choiceSerializer = func(choice : BotCommandOptionChoice<Float>) : Json.Json = serializeChoice(choice.name, #number(#float(choice.value)), choice.visible_when);
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

    private func serializeChoice(name : Text, value : Json.Json, visibleWhen : ?CommandParamCondition) : Json.Json {
        var fields : [(Text, Json.Json)] = [
            ("name", #string(name)),
            ("value", value),
        ];
        switch (visibleWhen) {
            case (null) ();
            case (?condition) fields := Array.append(fields, [("visible_when", serializeCondition(condition))]);
        };

        #object_(fields);
    };

    private func serializeCondition(condition : CommandParamCondition) : Json.Json {
        #object_([
            ("param", #string(condition.param)),
            ("values", Serialize.arrayOfValues(condition.values, func(value : Text) : Json.Json = #string(value))),
        ]);
    };

    private func serializeDefaultSubscriptions(subscriptions : BotSubscriptions) : Json.Json {
        #object_([
            ("community", Serialize.arrayOfValues(subscriptions.community, E.serializeCommunityEventType)),
            ("chat", Serialize.arrayOfValues(subscriptions.chat, E.serializeChatEventType)),
        ]);
    };

    private func serializeRestrictedLocationType(location : InstallationLocationType) : Json.Json {
        switch (location) {
            case (#Community) #string("Community");
            case (#Group) #string("Group");
            case (#User) #string("User");
        };
    };
};
