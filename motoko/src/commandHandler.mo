import Array "mo:base/Array";
import Float "mo:base/Float";
import Int "mo:base/Int";
import Int64 "mo:base/Int64";
import Result "mo:base/Result";
import Text "mo:base/Text";

import CommandContext "api/bot/commandContext";
import CommandResponse "api/bot/commandResponse";
import Definition "api/bot/definition";
import Base "api/common/base";
import Command "api/common/command";
import Client "client";
import Der "utils/der";

module {
    public type CommandHandler = {
        definition : Definition.Command;
        execute : Execute;
    };

    public type Execute = Client.CommandClient -> async Result.Result<CommandResponse.SuccessResult, Text>;

    public type SyncHandler = CommandContext.CommandContext -> CommandResponse.Response;

    public class Registry() = this {
        var handlers : [CommandHandler] = [];
        var syncApiKeyHandler : ?SyncHandler = null;
        let syncApiKeyParams : [Definition.CommandParam] = buildSyncApiKeyParams();

        public func register(handler : CommandHandler) : Registry {
            handlers := Array.append(handlers, [handler]);
            this;
        };

        public func onSyncApiKey(handler : SyncHandler) : Registry {
            syncApiKeyHandler := ?handler;
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

        public func execute(jwt : Text, ocPublicKey : Der.PublicKey, now : Base.TimestampMillis) : async CommandResponse.Response {
            let context = switch (CommandContext.parseJwt(jwt, ocPublicKey, now)) {
                case (#err(#invalidSignature)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid signature"));
                case (#err(#expired(_))) return #BadRequest(#AccessTokenExpired);
                case (#err(#parseError(reason))) return #BadRequest(#AccessTokenInvalid("JWT: Parse error: " # reason));
                case (#err(#invalidClaims)) return #BadRequest(#AccessTokenInvalid("JWT: Invalid claims"));
                case (#ok(data)) data;
            };

            let commandName = context.command.name;

            if (commandName == "sync_api_key") {
                switch (syncApiKeyHandler) {
                    case (?handler) {
                        if (not checkArgs(context.command.args, syncApiKeyParams, now)) {
                            return #BadRequest(#ArgsInvalid);
                        };
                        return handler(context);
                    };
                    case null return #BadRequest(#CommandNotFound);
                };
            };

            let ?handler = findHandler(commandName) else {
                return #BadRequest(#CommandNotFound);
            };

            if (not checkArgs(context.command.args, handler.definition.params, now)) {
                return #BadRequest(#ArgsInvalid);
            };

            switch (await handler.execute(Client.CommandClient(context))) {
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

            label l for (param in params.values()) {
                let ?arg = Array.find(
                    args,
                    func(arg : Command.CommandArg) : Bool {
                        arg.name == param.name;
                    },
                ) else {
                    if (param.required) {
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

    func buildSyncApiKeyParams() : [Definition.CommandParam] {
        [{
            name = "api_key";
            description = null;
            placeholder = null;
            required = true;
            param_type = #StringParam {
                max_length = 1000;
                min_length = 10;
                multi_line = false;
                choices = [];
            };
        }];
    };
};
