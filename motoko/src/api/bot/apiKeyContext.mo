import Base64 "mo:base64";
import Json "mo:json";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Blob "mo:base/Blob";
import B "../common/base";
import Scope "../common/actionScope";
import Permissions "../common/permissions";
import Deserialize "../common/deserialization";
import ActionContext "actionContext";
import Chat "../common/chat";

module {
    public type ApiKeyContext = {
        key : Text;
        botId : B.UserId;
        apiGateway : B.CanisterId;
        scope : Scope.ActionScope;
        grantedPermissions : Permissions.Permissions;
    };

    public func toActionContext(context : ApiKeyContext) : ActionContext.ActionContext {
        {
            botId = context.botId;
            apiGateway = context.apiGateway;
            authToken = #ApiKey(context.key);
            grantedPermissions = ?context.grantedPermissions;
            scope = context.scope;
            messageId = null;
            thread = null;
        };
    };

    public func parse(text : Text) : Result.Result<ApiKeyContext, Text> {
        let base64Engine = Base64.Base64(#v(Base64.V2), ?true);

        let ?apiKeyText = base64Engine.decode(text) |> Blob.fromArray(_) |> Text.decodeUtf8(_) else {
            return #err("Failed to decode api key as UTF-8");
        };
        
        let apiKeyJson = switch (Json.parse(apiKeyText)) {
            case (#ok(json)) json;
            case (#err(e)) return #err("Failed to parse api key json: " # debug_show (e));
        };

        Des.deserializeRawApiKey(apiKeyJson, text);
    };

    module Des {
        public func deserializeRawApiKey(dataJson : Json.Json, key : Text) : Result.Result<ApiKeyContext, Text> {
            let apiGateway = switch (Deserialize.principal(dataJson, "gateway")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'gateway' field: " # debug_show (e));
            };
            let botId = switch (Deserialize.principal(dataJson, "bot_id")) {
                case (#ok(v)) v;
                case (#err(e)) return #err("Invalid 'bot_id' field: " # debug_show (e));
            };

            let scope = switch (Json.getAsObject(dataJson, "scope")) {
                case (#ok(scope)) switch (deserializeApiKeyScope(scope)) {
                    case (#ok(v)) v;
                    case (#err(e)) return #err("Invalid 'scope' field: " # e);
                };
                case (#err(e)) return #err("Invalid 'scope' field: " # debug_show (e));
            };

            let permissions = switch (Json.get(dataJson, "permissions")) {
                case (?permissions) switch (Permissions.deserialize(permissions)) {
                    case (#ok(v)) v;
                    case (#err(e)) return #err("Invalid 'permissions' field: " # e);
                };
                case (null) return #err("Missing 'permissions' field");
            };

            #ok({
                key = key;
                apiGateway = apiGateway;
                botId = botId;
                scope = scope;
                grantedPermissions = permissions;
            });
        };

        private func deserializeApiKeyScope(scopeJson : [(Text, Json.Json)]) : Result.Result<Scope.ActionScope, Text> {
            let (scopeType, scopeTypeValue) = scopeJson[0];
            switch (scopeType) {
                case ("Chat") switch (Json.getAsObject(scopeTypeValue, "")) {
                    case (#ok(chatObj)) switch (Chat.deserialize(chatObj[0])) {
                        case (#ok(chat)) #ok(#Chat(chat));
                        case (#err(e)) return #err("Invalid 'Chat' scope value: " # e);
                    };
                    case (#err(e)) return #err("Invalid 'Chat' scope value: " # debug_show (e));
                };
                case ("Community") switch (Deserialize.principal(scopeTypeValue, "")) {
                    case (#ok(canisterId)) #ok(#Community(canisterId));
                    case (#err(e)) return #err("Invalid 'Community' scope value: " # debug_show (e));
                };
                case (_) return #err("Invalid 'scope' field variant type: " # scopeType);
            };
        };
    };
}