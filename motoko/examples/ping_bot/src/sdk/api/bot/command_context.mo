import Json "mo:json";
import Result "mo:base/Result";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Option "mo:base/Option";
import Nat32 "mo:base/Nat32";
import Time "mo:base/Time";
import T "../common/base";
import Scope "../common/scope";
import Command "command";
import Permissions "permissions";
import Deserialize "../common/deserialization";
import DER "../../utils/der";
import JWT "../../utils/jwt";

module {
    public type BotCommandContext = {
        jwt : Text;
        botId : T.UserId;
        apiGateway : T.CanisterId;
        command : Command.Command;
        scope : Scope.BotCommandScope;
        grantedPermissions : Permissions.BotPermissions;
    };

    public func parseJwt(text : Text, publicKey : DER.PublicKey, now : Time.Time) : Result.Result<BotCommandContext, JWT.VerifyError> {
        switch (JWT.verify(text, publicKey, now)) {
            case (#ok(result)) {
                if (result.claimType != "BotActionByCommand") {
                    return #err(#invalidClaims);
                };

                switch (Des.deserializeContext(result.data, text)) {
                    case (#ok(context)) #ok(context);
                    case (#err(_)) return #err(#invalidClaims);
                }
            };
            case (#err(e)) return #err(e);
        };
    };

    // type ParseResult = Result.Result<BotCommandContext, JWT.VerifyError>;
    // 
    // public func parseJwt2(text : Text, publicKey : DER.PublicKey, now : Time.Time) : ParseResult {
    //     func deserializeClaims(jwt : JWT.JWT) : ParseResult {
    //         if (jwt.claimType != "BotActionByCommand") {
    //             return #err(#invalidClaims);
    //         };

    //         Des.deserializeContext(jwt.data, text) 
    //             |> Result.mapErr(_, func(_err : Text) : JWT.VerifyError {#invalidClaims})
    //     };

    //     JWT.verify(text, publicKey, now) 
    //         |> Result.mapOk(_, deserializeClaims) 
    //         |> Result.flatten(_);
    // };

    module Des {
        public func deserializeContext(dataJson : Json.Json, jwt : Text) :  Result.Result<BotCommandContext, Text> {
            let (scopeType, scopeTypeValue) = switch (Json.getAsObject(dataJson, "scope")) {
                case (#ok(scopeObj)) scopeObj[0];
                case (#err(e)) return #err("Invalid 'scope' field: " # debug_show (e));
            };
            let scope : Scope.BotCommandScope = switch (scopeType) {
                case ("Chat") switch (deserializeBotActionChatDetails(scopeTypeValue)) {
                    case (#ok(chat)) #Chat(chat);
                    case (#err(e)) return #err("Invalid 'Chat' scope value: " # e);
                };
                case ("Community") switch (deserializeBotActionCommunityDetails(scopeTypeValue)) {
                    case (#ok(community)) #Community(community);
                    case (#err(e)) return #err("Invalid 'Community' scope value: " # e);
                };
                case (_) return #err("Invalid 'scope' field variant type: " # scopeType);
            };

            let botApiGateway = switch (Deserialize.principal(dataJson, "bot_api_gateway")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'bot_api_gateway' field: " # debug_show (e));
            };
            let bot = switch (Deserialize.principal(dataJson, "bot")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'bot' field: " # debug_show (e));
            };
            let grantedPermissions = switch (Json.get(dataJson, "granted_permissions")) {
                case (?permissions) switch (Permissions.deserialize(permissions)) {
                    case (#ok(v)) v;
                    case (#err(e)) return #err("Invalid 'granted_permissions' field: " # e);
                };
                case (null) return #err("Missing 'granted_permissions' field");
            };
            let command = switch (Json.get(dataJson, "command")) {
                case (?commandJson) switch (Command.deserialize(commandJson)) {
                    case (#ok(v)) v;
                    case (#err(e)) return #err("Invalid 'command' field: " # e);
                };
                case (null) return #err("Missing 'command' field");
            };

            #ok({
                jwt = jwt;
                apiGateway = botApiGateway;
                botId = bot;
                scope = scope;
                grantedPermissions = grantedPermissions;
                command = command;
            });
            
        };

        private func deserializeBotActionChatDetails(dataJson : Json.Json) : Result.Result<Scope.BotActionChatDetails, Text> {
            let chat = switch (Json.getAsObject(dataJson, "chat")) {
                case (#ok(chatObj)) switch (deserializeChat(chatObj[0])) {
                    case (#ok(v)) v;
                    case (#err(e)) return #err("Invalid 'chat' field: " # e);
                };
                case (#err(e)) return #err("Invalid 'chat' field: " # debug_show (e));
            };

            let thread = switch (Json.getAsNat(dataJson, "thread")) {
                case (#ok(v)) ?Nat32.fromNat(v);
                case (#err(_)) null;
            };

            let messageIdText = switch (Json.getAsText(dataJson, "message_id")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'message_id' field: " # debug_show (e));
            };

            let ?messageId = Nat.fromText(messageIdText) |> Option.map(_, Nat64.fromNat) else {
                return #err("Invalid 'message_id' field: " # messageIdText);
            };

            #ok({
                chat = chat;
                thread = thread;
                message_id = messageId;
                user_message_id = null;
            });
        };

        private func deserializeChat(chatVariantJson : (Text, Json.Json)) : Result.Result<Scope.Chat, Text> {
            let (chatType, chatTypeValue) = chatVariantJson;
            let chat : Scope.Chat = switch (chatType) {
                case ("Direct") switch (Deserialize.principal(chatTypeValue, "")) {
                    case (#ok(p)) #Direct(p);
                    case (#err(e)) return #err("Invalid 'Direct' chat value: " # debug_show (e));
                };
                case ("Group") switch (Deserialize.principal(chatTypeValue, "")) {
                    case (#ok(p)) #Group(p);
                    case (#err(e)) return #err("Invalid 'Group' chat value: " # debug_show (e));
                };
                case ("Channel") {
                    let channelPrincipal = switch (Deserialize.principal(chatTypeValue, "[0]")) {
                        case (#ok(v)) v;
                        case (#err(e)) return #err("Invalid 'Channel' chat value: " # debug_show (e));
                    };
                    let channelId = switch (Json.getAsNat(chatTypeValue, "[1]")) {
                        case (#ok(v)) Nat32.fromNat(v);
                        case (#err(e)) return #err("Invalid 'Channel' chat value: " # debug_show (e));
                    };
                    #Channel((channelPrincipal, channelId));
                };
                case (_) return #err("Invalid 'chat' field variant type: " # chatType);
            };
            #ok(chat);
        };

        private func deserializeBotActionCommunityDetails(dataJson : Json.Json) : Result.Result<Scope.BotActionCommunityDetails, Text> {
            let communityId = switch (Deserialize.principal(dataJson, "community_id")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'community_id' field: " # debug_show (e));
            };

            #ok({
                community_id = communityId;
            });
        };
    };
}