import Array "mo:base/Array";
import Float "mo:base/Float";
import Int "mo:base/Int";
import Int64 "mo:base/Int64";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Ecdsa "mo:ecdsa";

import CommandContext "api/bot/commandContext";
import CommandResponse "api/bot/commandResponse";
import Definition "api/bot/definition";
import Base "api/common/base";
import Command "api/common/command";
import Client "client";
import ActionContext "api/bot/actionContext";

module {
    public type CommandHandler = {
        definition : Definition.Command;
        execute : Execute;
    };

    public type Execute = (Client.OpenChatClient, CommandContext.CommandContext) -> async Result.Result<CommandResponse.SuccessResult, Text>;

    public type SyncHandler = CommandContext.CommandContext -> CommandResponse.Response;

    public class Registry() = this {
        var handlers : [CommandHandler] = [];

        public func register(handler : CommandHandler) : Registry {
            handlers := Array.append(handlers, [handler]);
            this;
        };

        public func definitions() : [Definition.Command] {
            Array.map(
                handlers,
                func(handler : CommandHandler) : Definition.Command {
                    handler.definition;
                },
            );
        };

        public func execute(jwt : Text, ocPublicKey : Ecdsa.PublicKey, now : Base.TimestampMillis) : async CommandResponse.Response {
            let context = switch (CommandContext.parseJwt(jwt, ocPublicKey)) {
                case (#err(#invalidSignature)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid signature"));
                case (#err(#expired(_))) return #BadRequest(#AccessTokenExpired);
                case (#err(#parseError(reason))) return #BadRequest(#AccessTokenInvalid("JWT: Parse error: " # reason));
                case (#err(#invalidClaims)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid claims"));
                case (#ok(data)) data;
            };

            let commandName = context.command.name;

            let ?handler = findHandler(commandName) else {
                return #BadRequest(#CommandNotFound);
            };

            if (not checkArgs(context.command.args, handler.definition.params, now)) {
                return #BadRequest(#ArgsInvalid);
            };

            let actionContext : ActionContext.ActionContext = CommandContext.toActionContext(context);

            switch (await handler.execute(Client.OpenChatClient(actionContext), context)) {
                case (#ok(result)) return #Success(result);
                case (#err(error)) {
                    return #InternalError(#CommandError(error));
                };
            };
        };

        func findHandler(name : Text) : ?CommandHandler {
            Array.find(
                handlers,
                func(handler : CommandHandler) : Bool {
                    handler.definition.name == name;
                },
            );
        };

        func checkArgs(
            args : [Command.CommandArg],
            params : [Definition.CommandParam],
            now : Base.TimestampMillis,
        ) : Bool {
            if (args.size() > params.size()) {
                return false;
            };

            label l for (index in params.keys()) {
                let param = params[index];
                let ?arg = Array.find(
                    args,
                    func(arg : Command.CommandArg) : Bool {
                        arg.name == param.name;
                    },
                ) else {
                    // OpenChat doesn't send a param its condition hides, so it's only required while shown
                    if (param.required and isShown(index, params, args)) {
                        return false;
                    };

                    continue l;
                };

                switch (param.param_type) {
                    case (#StringParam p) {
                        let value = switch (arg.value) {
                            case (#String(v)) v;
                            case _ return false;
                        };

                        if (value.size() < p.min_length) {
                            return false;
                        };

                        if (value.size() > p.max_length) {
                            return false;
                        };

                        if (not isValidChoice(p.choices, value, Text.equal)) {
                            return false;
                        };
                    };
                    case (#DecimalParam p) {
                        let value = switch (arg.value) {
                            case (#Decimal(v)) v;
                            case _ return false;
                        };

                        if (value < p.min_value) {
                            return false;
                        };

                        if (value > p.max_value) {
                            return false;
                        };

                        if (not isValidChoice(p.choices, value, floatEqual)) {
                            return false;
                        };
                    };
                    case (#IntegerParam p) {
                        let value = switch (arg.value) {
                            case (#Integer(v)) Int64.toInt(v);
                            case _ return false;
                        };

                        if (value < p.min_value) {
                            return false;
                        };

                        if (value > p.max_value) {
                            return false;
                        };

                        if (not isValidChoice(p.choices, value, Int.equal)) {
                            return false;
                        };
                    };
                    case (#DateTimeParam p) {
                        let value = switch (arg.value) {
                            case (#DateTime(v)) v;
                            case _ return false;
                        };

                        if (p.future_only and value < now) {
                            return false;
                        };
                    };
                    case (#BooleanParam) {
                        switch (arg.value) {
                            case (#Boolean(_)) return true;
                            case _ return false;
                        };
                    };
                    case (#UserParam) {
                        switch (arg.value) {
                            case (#User(_)) return true;
                            case _ return false;
                        };
                    };
                };
            };

            true;
        };

        // Whether OpenChat's form shows the param at `index`, given the args: while its condition,
        // if it has one, holds, and while one of its choices is shown, if it has choices
        func isShown(index : Nat, params : [Definition.CommandParam], args : [Command.CommandArg]) : Bool {
            let holds = func(condition : ?Definition.CommandParamCondition) : Bool {
                switch (condition) {
                    case (null) true;
                    case (?c) conditionHolds(c, index, params, args);
                };
            };
            let param = params[index];
            if (not holds(param.visible_when)) {
                return false;
            };
            switch (param.param_type) {
                case (#StringParam p) anyChoiceShown(p.choices, holds);
                case (#IntegerParam p) anyChoiceShown(p.choices, holds);
                case (#DecimalParam p) anyChoiceShown(p.choices, holds);
                case _ true;
            };
        };

        // A param without choices has none to hide
        func anyChoiceShown<T>(
            choices : [Definition.BotCommandOptionChoice<T>],
            holds : ?Definition.CommandParamCondition -> Bool,
        ) : Bool {
            if (choices.size() == 0) {
                return true;
            };
            for (choice in choices.values()) {
                if (holds(choice.visible_when)) {
                    return true;
                };
            };
            false;
        };

        // Whether a condition on the param at `index` holds: the earlier param it names is shown,
        // and that param's arg is one of the condition's values
        func conditionHolds(
            condition : Definition.CommandParamCondition,
            index : Nat,
            params : [Definition.CommandParam],
            args : [Command.CommandArg],
        ) : Bool {
            var named : ?Nat = null;
            label find for (i in params.keys()) {
                if (i >= index) {
                    break find;
                };
                if (params[i].name == condition.param) {
                    named := ?i;
                    break find;
                };
            };
            let ?i = named else {
                return false;
            };
            if (not isShown(i, params, args)) {
                return false;
            };
            let ?arg = Array.find(
                args,
                func(arg : Command.CommandArg) : Bool {
                    arg.name == condition.param;
                },
            ) else {
                return false;
            };
            switch (arg.value) {
                case (#String(value)) Array.find(condition.values, func(v : Text) : Bool { v == value }) != null;
                case _ false;
            };
        };

        func isValidChoice<T>(array : [Definition.BotCommandOptionChoice<T>], value : T, valueEq : (T, T) -> Bool) : Bool {
            if (array.size() == 0) {
                return true;
            };

            switch (
                Array.find(
                    array,
                    func(choice : Definition.BotCommandOptionChoice<T>) : Bool {
                        valueEq(choice.value, value);
                    },
                )
            ) {
                case (?_) return true;
                case null return false;
            };
        };

        func floatEqual(a : Float, b : Float) : Bool {
            Float.equalWithin(a, b, 1e-8);
        };
    };
};
