import Hash "mo:base/Hash";
import Principal "mo:base/Principal";

import B "base";
import Chat "chat";
import InstallationLocation "installationLocation";

module {
    public type ActionScope = {
        #Chat : Chat.Chat;
        #Community : B.CanisterId;
    };

    public func communityId(scope : ActionScope) : ?B.CanisterId {
        switch (scope) {
            case (#Chat(#Channel(id, _))) { ?id };
            case (#Chat(_)) { null };
            case (#Community(id)) { ?id };
        };
    };

    public func fromLocation(location: InstallationLocation.InstallationLocation) : ActionScope {
        switch (location) {
            case (#Community(id)) { #Community(id) };
            case (#Group(id)) { #Chat(#Group(id)) };
            case (#User(id)) { #Chat(#Direct(id)) };
        };
    };

    public func equal(a : ActionScope, b : ActionScope) : Bool {
        switch (a, b) {
            case (#Chat(aId), #Chat(bId)) {
                Chat.equal(aId, bId);
            };
            case (#Community(aId), #Community(bId)) {
                aId == bId;
            };
            case (_, _) {
                false;
            };
        };
    };

    public func hash(a : ActionScope) : Hash.Hash {
        switch (a) {
            case (#Chat(id)) {
                Chat.hash(id);
            };
            case (#Community(id)) {
                Principal.hash(id);
            };
        };
    };
};
