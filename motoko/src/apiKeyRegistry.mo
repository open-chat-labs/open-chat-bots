import Permissions "api/common/permissions";
import Scope "api/common/actionScope";
import ApiKeyContext "api/bot/apiKeyContext";
import HashMap "mo:base/HashMap";
import Result "mo:base/Result";
import Array "mo:base/Array";
import Iter "mo:base/Iter";

module {
    public func new(apiKeys : [Text]) : ApiKeyRegistry {
        var registry = ApiKeyRegistry();

        for (key in apiKeys.values()) {
            ignore registry.insert(key);
        };

        registry;
    };

    public class ApiKeyRegistry() {
        var map = HashMap.HashMap<Scope.ActionScope, Record>(10, Scope.equal, Scope.hash);

        public func insert(apiKey : Text) : Result.Result<(), Text> {
            let cxt = switch (ApiKeyContext.parse(apiKey)) {
                case (#ok(cxt)) cxt;
                case (#err(e)) return #err(e);
            };

            map.put(cxt.scope, {
                key = cxt.key;
                grantedPermissions = cxt.grantedPermissions; 
            });

            #ok();
        };

        public func getApiKeys() : [Text] {
            map.vals() |> Iter.toArray(_) |> Array.map(_, func (record : Record) : Text { record.key });
        };

        public func get(scope: Scope.ActionScope) : ?Record {
            map.get(scope);
        };

        public func remove(scope: Scope.ActionScope) {
            map.delete(scope);
        };

        public func count() : Nat {
            map.size();
        };

        public func getKeyWithRequiredPermissions(
            scope: Scope.ActionScope, 
            requiredPermissions: Permissions.Permissions) 
        : ?Record {
            switch (getMatchingRecord(scope, requiredPermissions)) {
                case (?record) {
                    return ?record;
                };
                case (null) {
                };
            };

            // If an API Key with the required permissions cannot be found at the
            // channel scope then check the community scope
            switch (scope) {
                case (#Chat(#Channel(communityId, _))) {
                    return getMatchingRecord(#Community(communityId), requiredPermissions);
                };
                case (_) return null;
            };
        };

        func getMatchingRecord(
            scope: Scope.ActionScope, 
            requiredPermissions: Permissions.Permissions) 
        : ?Record {
            switch (get(scope)) {
                case (?record) {
                    if (Permissions.isSubset(requiredPermissions, record.grantedPermissions)) {
                        return ?record;
                    };
                };
                case (null) {
                };
            };

            null;
        };
    };

    public type Record = {
        key : Text;
        grantedPermissions : Permissions.Permissions;
    };
};